// src/services/conceptDbService.ts
import { ContentType, CourseContentType } from "@prisma/client";
import { ConceptAnalysisResult, buildFullConceptId } from "./conceptService";
import prisma from "../lib/prisma";

export interface CreateConceptWithContentInput {
  analysisResult: ConceptAnalysisResult;
  contentType: ContentType;
  title?: string;
  ytLink?: string;
  path?: string;
}

export interface CreateConceptWithContentResult {
  success: boolean;
  conceptId?: string;
  contentId?: string;
  fullConceptId?: string;
  error?: string;
}

/**
 * Creates or finds a concept and links it with content
 * Returns the full concept ID (e.g., SCIENCE.WATER-CYCLE.001)
 */
export async function createConceptWithContent(
  input: CreateConceptWithContentInput
): Promise<CreateConceptWithContentResult> {
  try {
    const { analysisResult, contentType, title, ytLink, path } = input;
    const { baseConceptId, domain, conceptSlug, keywords, learningObjective } = analysisResult;

    // Find the next sequence number for this base concept
    const existingConcepts = await prisma.concept.findMany({
      where: { baseConceptId },
      orderBy: { sequence: "desc" },
      take: 1,
    });

    const nextSequence = existingConcepts.length > 0 ? existingConcepts[0].sequence + 1 : 1;
    const fullConceptId = buildFullConceptId(baseConceptId, nextSequence);

    // Create concept and content in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const concept = await tx.concept.create({
        data: {
          conceptId: fullConceptId,
          baseConceptId,
          domain,
          conceptSlug,
          sequence: nextSequence,
          keywords,
          learningObjective,
        },
      });

      const content = await tx.content.create({
        data: {
          conceptId: concept.id,
          contentType,
          title,
          ytLink,
          path,
        },
      });

      return { concept, content };
    });

    console.log(`✅ Created concept: ${fullConceptId} with content type: ${contentType}`);

    return {
      success: true,
      conceptId: result.concept.id,
      contentId: result.content.id,
      fullConceptId,
    };
  } catch (error: any) {
    console.error("[ConceptDbService] Error creating concept with content:", error);
    return {
      success: false,
      error: error.message || "Failed to create concept with content",
    };
  }
}

/**
 * Link a user to a concept
 */
export async function linkUserToConcept(userId: string, conceptId: string): Promise<boolean> {
  try {
    await prisma.userConcept.create({
      data: {
        userId,
        conceptId,
      },
    });
    return true;
  } catch (error: any) {
    // Ignore duplicate key errors (user already linked to concept)
    if (error.code === "P2002") {
      console.log(`User ${userId} already linked to concept ${conceptId}`);
      return true;
    }
    console.error("[ConceptDbService] Error linking user to concept:", error);
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/*                          MODULE CONTENT MANAGEMENT                         */
/* -------------------------------------------------------------------------- */

export interface CreateModuleContentInput {
  moduleId: string;
  type: CourseContentType;
  title?: string;
  sequence_order?: number;
  is_required?: boolean;

  // For NOTES
  body?: string; // Markdown content

  // For MCQ
  question?: string;
  options?: any; // JSON
  correct_answer?: string;
  explanation?: string;
  difficulty?: string;

  // Analysis result for concept generation
  analysisResult: ConceptAnalysisResult;
}

export interface ModuleContentResult {
  success: boolean;
  contentId?: string;
  conceptId?: string;
  error?: string;
  data?: any;
}

/**
 * Creates a new content item (Note/MCQ) linked to a module via a concept
 */
export async function createModuleContent(
  input: CreateModuleContentInput
): Promise<ModuleContentResult> {
  try {
    const {
      moduleId, type, title, sequence_order, is_required,
      body, question, options, correct_answer, explanation, difficulty,
      analysisResult
    } = input;

    const { baseConceptId, domain, conceptSlug, keywords, learningObjective } = analysisResult;

    // Transaction to ensure atomicity
    const result = await prisma.$transaction(async (tx) => {
      // 1. Verify Module exists
      const module = await tx.module.findUnique({ where: { id: moduleId } });
      if (!module) throw new Error("Module not found");

      // 2. Handle Concept Creation/Finding
      // Logic: For now, we create a new concept instance for this content to keep it granular
      // as requested ("concept we will be creating... with required order_index")

      // Find next sequence for concept ID generation
      const existingConcepts = await tx.concept.findMany({
        where: { baseConceptId },
        orderBy: { sequence: "desc" },
        take: 1,
      });

      const nextSequence = existingConcepts.length > 0 ? existingConcepts[0].sequence + 1 : 1;
      const fullConceptId = buildFullConceptId(baseConceptId, nextSequence);

      const concept = await tx.concept.create({
        data: {
          conceptId: fullConceptId,
          baseConceptId,
          domain,
          conceptSlug,
          sequence: nextSequence,
          keywords,
          learningObjective,
        },
      });

      // 3. Link Concept to Module
      // Find valid order_index for ModuleConcept
      // If sequence_order is provided for content, we assume it's also the order for the concept in the module 
      // OR we just append to the end if not specified.
      // The user mentioned "ModuleConcept Entry with required order_index".

      let conceptOrderIndex = 0;
      const maxModuleConcept = await tx.moduleConcept.aggregate({
        where: { module_id: moduleId },
        _max: { order_index: true }
      });
      conceptOrderIndex = (maxModuleConcept._max.order_index ?? -1) + 1;

      await tx.moduleConcept.create({
        data: {
          module_id: moduleId,
          concept_id: concept.id,
          order_index: conceptOrderIndex,
        }
      });

      // 4. Create CourseContentItem
      // This links Content to Concept. Since 1 concept <-> 1 content item usually in this flow,
      // sequence_order within concept is 0 by default.
      const contentItem = await tx.courseContentItem.create({
        data: {
          concept_id: concept.id,
          content_kind: type,
          title: title || (type === "NOTES" ? "Note" : "Quiz"),
          sequence_order: sequence_order ?? 0,
          is_required: is_required ?? true,
        }
      });

      // 5. Create specific content record (Note or MCQ)
      let specificContent;
      if (type === "NOTES") {
        if (!body) throw new Error("Body is required for NOTES");
        specificContent = await tx.note.create({
          data: {
            content_item_id: contentItem.id,
            body,
            format: 'markdown',
            version: 1
          }
        });
      } else if (type === "MCQ") {
        if (!question || !options || !correct_answer) {
          throw new Error("Question, options, and correct_answer are required for MCQ");
        }
        specificContent = await tx.mCQ.create({
          data: {
            content_item_id: contentItem.id,
            question,
            options, // Ensure this is valid JSON
            correct_answer,
            explanation,
            difficulty: difficulty || 'medium'
          }
        });
      } else {
        throw new Error(`Unsupported content type: ${type}`);
      }

      return {
        concept,
        contentItem,
        specificContent
      };
    });

    console.log(`✅ Created module content: ${result.contentItem.id} (${type})`);

    return {
      success: true,
      contentId: result.contentItem.id,
      conceptId: result.concept.id,
      data: result
    };

  } catch (error: any) {
    console.error("[ConceptDbService] Error creating module content:", error);
    return {
      success: false,
      error: error.message || "Failed to create module content"
    };
  }
}

/**
 * Updates a content item
 */
export async function updateModuleContent(
  contentId: string,
  updates: Partial<CreateModuleContentInput>
): Promise<ModuleContentResult> {
  try {
    const {
      type, title, is_required,
      body, question, options, correct_answer, explanation, difficulty
    } = updates;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Update CourseContentItem common fields
      const inputData: any = { updated_at: new Date() };
      if (title !== undefined) inputData.title = title;
      if (is_required !== undefined) inputData.is_required = is_required;

      const contentItem = await tx.courseContentItem.update({
        where: { id: contentId },
        data: inputData,
        include: { Note: true, MCQ: true } // Fetch current type to verify
      });

      // 2. Update specific table
      let specificContent;
      // We assume type cannot be changed easily without migration, so we check existing type
      if (contentItem.content_kind === "NOTES") {
        if (body !== undefined) {
          specificContent = await tx.note.update({
            where: { content_item_id: contentId },
            data: {
              body,
              version: { increment: 1 }
            }
          });
        }
      } else if (contentItem.content_kind === "MCQ") {
        const mcqUpdates: any = {};
        if (question !== undefined) mcqUpdates.question = question;
        if (options !== undefined) mcqUpdates.options = options;
        if (correct_answer !== undefined) mcqUpdates.correct_answer = correct_answer;
        if (explanation !== undefined) mcqUpdates.explanation = explanation;
        if (difficulty !== undefined) mcqUpdates.difficulty = difficulty;

        if (Object.keys(mcqUpdates).length > 0) {
          specificContent = await tx.mCQ.update({
            where: { content_item_id: contentId },
            data: mcqUpdates
          });
        }
      }

      return { contentItem, specificContent };
    });

    return {
      success: true,
      contentId,
      data: result
    };
  } catch (error: any) {
    console.error(`[ConceptDbService] Error updating content ${contentId}:`, error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Deletes a content item
 */
export async function deleteModuleContent(contentId: string): Promise<boolean> {
  try {
    await prisma.$transaction(async (tx) => {
      // Get the concept ID before deleting to check if we should cleanup
      const item = await tx.courseContentItem.findUnique({
        where: { id: contentId },
        select: { concept_id: true }
      });

      if (!item) throw new Error("Content item not found");

      // Delete the content item (Cascades to Note/MCQ)
      await tx.courseContentItem.delete({
        where: { id: contentId }
      });

      // Optional: Cleanup Concept if it has no other content items?
      // Since we created a 1-to-1 concept for this flow, we might want to delete the concept 
      // AND the ModuleConcept link.

      const remainingItems = await tx.courseContentItem.count({
        where: { concept_id: item.concept_id }
      });

      if (remainingItems === 0) {
        // Safe to delete concept?
        // Check if it's used elsewhere? UserConcept?
        // For now, let's just delete the ModuleConcept link first if we can identify it easily.
        // But ModuleConcept links Concept to Module.

        // If we delete the Concept, ModuleConcept will be deleted via Cascade likely?
        // Let's check schema:
        // ModuleConcept: Concept @relation(..., onDelete: Cascade) -> Yes.
        // CourseContentItem: Concept @relation(..., onDelete: Cascade) -> No wait, existing one:
        // Concept -> Content (legacy) ?
        // Concept -> CourseContentItem (Cascade)

        // So if we delete Concept, it deletes ModuleConcept (msg: "fk_concept").

        // So yes, strictly for this flow where we create a concept just for this content:
        await tx.concept.delete({
          where: { id: item.concept_id }
        });
      }
    });

    return true;
  } catch (error) {
    console.error(`[ConceptDbService] Error deleting content ${contentId}:`, error);
    return false;
  }
}

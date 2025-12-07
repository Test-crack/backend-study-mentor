// src/services/conceptDbService.ts
import { ContentType } from "@prisma/client";
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

export interface LinkUserToConceptInput {
  userId: string;
  conceptId: string;
  contentType: ContentType;
  title?: string;
  ytLink?: string;
  path?: string;
}

/**
 * Link a user to a concept and create content entry
 */
export async function linkUserToConcept(input: LinkUserToConceptInput): Promise<boolean> {
  const { userId, conceptId, contentType, title, ytLink, path } = input;
  
  try {
    await prisma.$transaction(async (tx) => {
      // Create user-concept link
      await tx.userConcept.create({
        data: {
          userId,
          conceptId,
        },
      });

      // Create content entry
      await tx.content.create({
        data: {
          conceptId,
          contentType,
          title,
          ytLink,
          path,
        },
      });
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

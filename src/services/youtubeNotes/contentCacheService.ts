/**
 * Content Cache Service
 * Handles database operations for checking and retrieving cached content
 */

import prisma from "../../lib/prisma";
import { ContentType } from "@prisma/client";

export interface CachedContent {
  contentId: string;
  conceptId: string;
  path: string;
  title: string;
  domain: string;
  conceptSlug: string;
  keywords: string[];
  learningObjective: string;
  fullConceptId: string;
}

/**
 * Check if YouTube content is already cached in database
 * @param videoId - YouTube video ID
 * @returns Cached content with concept metadata, or null if not found
 */
export async function getCachedYouTubeContent(
  videoId: string
): Promise<CachedContent | null> {
  try {
    // Find content by ytLink where path is not null
    const content = await prisma.content.findFirst({
      where: {
        ytLink: videoId,
        contentType: ContentType.YOUTUBE,
        path: {
          not: null,
        },
      },
      include: {
        Concept: true,
      },
    });

    if (!content || !content.path) {
      return null;
    }

    // Verify concept exists
    if (!content.Concept) {
      console.warn(`[ContentCache] Content found but concept missing for videoId: ${videoId}`);
      return null;
    }

    console.log(`[ContentCache] Cache HIT for videoId: ${videoId}`);

    return {
      contentId: content.id,
      conceptId: content.conceptId,
      path: content.path,
      title: content.title || '',
      domain: content.Concept.domain,
      conceptSlug: content.Concept.conceptSlug,
      keywords: content.Concept.keywords,
      learningObjective: content.Concept.learningObjective,
      fullConceptId: content.Concept.conceptId,
    };
  } catch (error: any) {
    console.error('[ContentCache] Error checking cache:', error);
    return null;
  }
}

/**
 * Update content path after saving to file system
 * @param contentId - Content ID from database
 * @param path - Relative path to the saved file
 */
export async function updateContentPath(
  contentId: string,
  path: string
): Promise<void> {
  try {
    await prisma.content.update({
      where: { id: contentId },
      data: { path },
    });
    console.log(`[ContentCache] Content path updated: ${contentId} -> ${path}`);
  } catch (error: any) {
    console.error('[ContentCache] Failed to update content path:', error);
    throw new Error(`Failed to update content path: ${error.message}`);
  }
}

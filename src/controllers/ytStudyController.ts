// This controller is for youtube video transcripts and study material generation
import { Request, Response } from "express";
import { getVideoIdFromUrl, fetchTranscript, mergeShortSegments, cleanTranscriptSegments, TranscriptSegment } from "../services/youtubeNotes/transcriptService";
import { summarizeTranscript } from "../services/youtubeNotes/summarizeService";
import { createConceptWithContent, linkUserToConcept } from "../services/conceptDbService";
import { getCachedYouTubeContent, updateContentPath } from "../services/youtubeNotes/contentCacheService";
import { saveStudyMaterial, loadStudyMaterial, studyMaterialExists } from "../services/youtubeNotes/fileStorageService";
import { ContentType } from "@prisma/client";
import { AuthRequest } from "../middleware/auth";



/**
 * Submit client-fetched transcript
 * Used when server methods fail and client successfully fetches transcript
 */
export async function submitClientTranscript(req: Request, res: Response) {
  try {
    console.log("submitClientTranscript request received:", req.body);
    const { videoId, transcript } = req.body as { 
      videoId?: string; 
      transcript?: TranscriptSegment[];
    };

    if (!videoId || typeof videoId !== "string") {
      return res.status(400).json({ error: "Missing videoId in request body" });
    }

    if (!Array.isArray(transcript) || transcript.length === 0) {
      return res.status(400).json({ error: "Missing or empty transcript array" });
    }

    // Validate transcript format
    const isValidTranscript = transcript.every(seg => 
      typeof seg.text === 'string' && 
      (seg.offset === undefined || typeof seg.offset === 'number') &&
      (seg.duration === undefined || typeof seg.duration === 'number')
    );

    if (!isValidTranscript) {
      return res.status(400).json({ error: "Invalid transcript format" });
    }

    console.log(`[ClientTranscript] Received ${transcript.length} segments for videoId: ${videoId}`);

    // Clean and merge the client-provided transcript
    const cleanedTranscript = cleanTranscriptSegments(transcript);
    const mergedTranscript = mergeShortSegments(cleanedTranscript, 5);

    // Save to cache asynchronously (don't wait)
    const { saveTranscriptToCache } = await import('../services/youtubeNotes/transcriptMethods/method0-caching.js');
    saveTranscriptToCache(videoId, mergedTranscript, 'Client-Assisted').catch((err: any) => {
      console.error(`[ClientTranscript] Failed to cache:`, err);
    });

    console.log(`✅ [ClientTranscript] Accepted and cached ${mergedTranscript.length} segments`);

    return res.json({
      status: 200,
      videoId,
      transcript: mergedTranscript,
      message: "Client transcript received and cached successfully.",
      method: "Client-Assisted"
    });

  } catch (err) {
    console.error("submitClientTranscript unexpected error:", err);
    return res.status(500).json({ error: "Unexpected server error" });
  }
}



/**
 * Extract transcript from YouTube video
 */
export async function extractTranscript(req: Request, res: Response) {
  try {
    console.log("extractTranscript request received:", req.body);
    const { url } = req.body as { url?: string };
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "Missing url in request body" });
    }

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch (e) {
      return res.status(400).json({ error: "Invalid URL" });
    }

    const hostname = parsed.hostname.toLowerCase();
    const isYoutubeHost =
      hostname === "youtu.be" ||
      hostname === "youtube.com" ||
      hostname === "www.youtube.com" ||
      hostname.endsWith(".youtube.com");
    if (!isYoutubeHost) {
      return res.status(400).json({ error: "URL must be a YouTube link" });
    }

    const videoId = getVideoIdFromUrl(parsed);
    if (!videoId) {
      return res.status(400).json({ error: "YouTube URL must contain a video id" });
    }

    // Use the modular transcript service
    const result = await fetchTranscript(videoId);

    if (!result.success) {
      // Handle different error types with appropriate status codes
      switch (result.code) {
        case 'CLIENT_FALLBACK_REQUIRED':
          // Special case: Server methods failed, request client-side assistance
          return res.status(206).json({ 
            error: result.error,
            code: 'CLIENT_FALLBACK_REQUIRED',
            videoId: videoId,
            message: 'Server transcript methods failed. Please fetch transcript on client-side and resubmit.'
          });
        case 'NO_TRANSCRIPT':
          return res.status(404).json({ error: result.error });
        case 'INVALID_VIDEO':
          return res.status(400).json({ error: result.error });
        case 'LIBRARY_ERROR':
          return res.status(500).json({ error: result.error });
        case 'FETCH_ERROR':
        default:
          return res.status(502).json({ error: result.error });
      }
    }
    
    result.transcript.sort((a, b) => (a.offset ?? 0) - (b.offset ?? 0));
    
    // Clean transcript text (remove HTML entities, music notations, etc.)
    const cleanedTranscript = cleanTranscriptSegments(result.transcript);
    
    // Merge adjacent segments with total duration < 5 seconds
    const mergedTranscript = mergeShortSegments(cleanedTranscript, 5);
    
    console.log(`Transcript fetched successfully for videoId: ${result.videoId}, segments: ${mergedTranscript.length}`);
    
    // Return cleaned and merged transcript to frontend
    return res.json({
      status: 200,
      videoId: result.videoId,
      transcript: mergedTranscript, // array of { text, offset, duration } (cleaned & merged)
      message: "Transcript fetched successfully.",
      method: result.method // Which method was used to fetch
    });
  } catch (err) {
    console.error("extractTranscript unexpected error:", err);
    return res.status(500).json({ error: "Unexpected server error" });
  }
}



/**
 * Generate study material from transcript
 */
export async function generateStudyMaterial(req: AuthRequest & { appUserId?: string }, res: Response) {
  try {
    const { videoId, transcript, language, title, url } = req.body as {
      videoId?: string;
      transcript?: TranscriptSegment[];
      language?: string;
      title?: string;
      url?: string;
    };

    if (!videoId || !Array.isArray(transcript)) {
      return res.status(400).json({ error: "Missing videoId or transcript" });
    }

    const userId = req.appUserId;
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    // ===== STEP 0: CHECK CACHE =====
    console.log(`[YTStudy] Checking cache for videoId: ${videoId}`);
    const cachedContent = await getCachedYouTubeContent(videoId);

    if (cachedContent) {
      // Cache hit - verify file exists
      const fileExists = await studyMaterialExists(cachedContent.path);
      
      if (fileExists) {
        console.log(`[YTStudy] Cache HIT - Loading from file: ${cachedContent.path}`);
        
        try {
          // Load markdown from file system
          const markdown = await loadStudyMaterial(cachedContent.path);
          
          // Link user to existing concept
          const linkSuccess = await linkUserToConcept(userId, cachedContent.conceptId);
          console.log(`✅ User ${userId} linked to cached concept: ${linkSuccess}`);
          
          return res.json({
            status: 200,
            videoId,
            markdown,
            concept: {
              conceptId: cachedContent.fullConceptId,
              domain: cachedContent.domain,
              conceptSlug: cachedContent.conceptSlug,
              keywords: cachedContent.keywords,
              learningObjective: cachedContent.learningObjective,
              userLinked: linkSuccess,
            },
            message: "Study material loaded from cache.",
            cached: true,
          });
        } catch (loadError: any) {
          console.error(`[YTStudy] Failed to load cached file: ${loadError.message}`);
          // Fall through to regenerate
        }
      } else {
        console.warn(`[YTStudy] Cache entry exists but file missing: ${cachedContent.path}`);
        // Fall through to regenerate
      }
    }

    console.log(`[YTStudy] Cache MISS - Generating new study material`);

    // ===== STEP 1: CLEAN AND PREPARE TRANSCRIPT =====
    // Clean transcript before sending to AI (remove HTML entities, music notations, etc.)
    const cleanedTranscript = cleanTranscriptSegments(transcript);
    console.log(`[YTStudy] Cleaned transcript: ${cleanedTranscript.length} segments`);

    // ===== STEP 2: GENERATE STUDY MATERIAL + EXTRACT CONCEPT METADATA =====
    const result = await summarizeTranscript({ videoId, transcript: cleanedTranscript, language });
    if (!result.success) {
      return res.status(502).json({ error: result.error });
    }

    const { markdown, conceptMetadata } = result;

    // ===== STEP 3: SAVE TO DATABASE =====
    let conceptResult = null;
    let contentId: string | null = null;

    try {
      const dbResult = await createConceptWithContent({
        analysisResult: {
          domain: conceptMetadata.domain,
          conceptSlug: conceptMetadata.conceptSlug,
          keywords: conceptMetadata.keywords,
          learningObjective: conceptMetadata.learningObjective,
          baseConceptId: conceptMetadata.baseConceptId,
        },
        contentType: ContentType.YOUTUBE,
        title: title || `YouTube Video ${videoId}`,
        ytLink: videoId,
        path: undefined, // Will be updated after file save
      });

      if (dbResult.success && dbResult.conceptId && dbResult.contentId) {
        contentId = dbResult.contentId;
        
        // ===== STEP 3.5: SAVE TO FILE SYSTEM =====
        try {
          const savedPath = await saveStudyMaterial(videoId, markdown);
          
          // Update content path in database
          await updateContentPath(contentId, savedPath);
          console.log(`✅ Study material cached to: ${savedPath}`);
        } catch (fileError: any) {
          console.error(`[YTStudy] Failed to cache file: ${fileError.message}`);
          // Non-critical - continue without caching
        }

        // ===== STEP 4: LINK USER TO CONCEPT =====
        const linkSuccess = await linkUserToConcept(userId, dbResult.conceptId);
        
        conceptResult = {
          conceptId: dbResult.fullConceptId,
          domain: conceptMetadata.domain,
          conceptSlug: conceptMetadata.conceptSlug,
          keywords: conceptMetadata.keywords,
          learningObjective: conceptMetadata.learningObjective,
          userLinked: linkSuccess,
        };
        
        console.log(`✅ Concept created and saved: ${dbResult.fullConceptId}`);
        console.log(`✅ User ${userId} linked to concept: ${linkSuccess}`);
      } else {
        console.error("Failed to save concept to database:", dbResult.error);
      }
    } catch (conceptError: any) {
      console.error("Concept extraction failed (non-critical):", conceptError.message);
      // Continue without concept - it's not critical for the main flow
    }

    return res.json({ 
      status: 200, 
      videoId, 
      markdown,
      concept: conceptResult,
      message: "Study material generated successfully.",
      cached: false,
    });
  } catch (e) {
    console.error("generateStudyMaterial error", e);
    return res.status(500).json({ error: "Unexpected server error" });
  }
}


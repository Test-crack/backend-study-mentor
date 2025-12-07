// This controller is for youtube video transcripts and study material generation
import { Request, Response } from "express";
import { getVideoIdFromUrl, fetchTranscript, mergeShortSegments, TranscriptSegment } from "../services/transcriptService";
import { summarizeTranscript } from "../services/summarizeService";
import { analyzeContentToConcept } from "../services/conceptService";
import { createConceptWithContent } from "../services/conceptDbService";
import { ContentType } from "@prisma/client";

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
    
    // Merge adjacent segments with total duration < 5 seconds
    const mergedTranscript = mergeShortSegments(result.transcript, 5);
    
    console.log(`Transcript fetched successfully for videoId: ${result.videoId}, segments: ${mergedTranscript.length}`);
    
    // Return raw transcript to frontend for testing/display
    return res.json({
      status: 200,
      videoId: result.videoId,
      transcript: mergedTranscript, // array of { text, offset, duration } (merged)
      message: "Transcript fetched successfully.",
    });
  } catch (err) {
    console.error("extractTranscript unexpected error:", err);
    return res.status(500).json({ error: "Unexpected server error" });
  }
}



/**
 * Generate study material from transcript
 */
export async function generateStudyMaterial(req: Request, res: Response) {
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

    // Step 1: Generate study material
    const summaryResult = await summarizeTranscript({ videoId, transcript, language });
    if (!summaryResult.success) {
      return res.status(502).json({ error: summaryResult.error });
    }

    // Step 2: Extract concepts from the generated study material
    let conceptResult = null;
    try {
      const transcriptText = transcript.map(seg => seg.text).join(" ");
      
      const conceptAnalysis = await analyzeContentToConcept({
        text: summaryResult.markdown,
        title: title || `YouTube Video ${videoId}`,
        sourceType: "youtube",
      });

      // Step 3: Save concept and content to database
      const dbResult = await createConceptWithContent({
        analysisResult: conceptAnalysis,
        contentType: ContentType.YOUTUBE,
        title: title || `YouTube Video ${videoId}`,
        ytLink: url || `https://youtube.com/watch?v=${videoId}`,
        path: videoId, // Store videoId as path for easy retrieval
      });

      if (dbResult.success) {
        conceptResult = {
          conceptId: dbResult.fullConceptId,
          domain: conceptAnalysis.domain,
          keywords: conceptAnalysis.keywords,
          learningObjective: conceptAnalysis.learningObjective,
        };
        console.log(`✅ Concept extracted and saved: ${dbResult.fullConceptId}`);
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
      markdown: summaryResult.markdown,
      concept: conceptResult,
      message: "Study material generated successfully."
    });
  } catch (e) {
    console.error("generateStudyMaterial error", e);
    return res.status(500).json({ error: "Unexpected server error" });
  }
}

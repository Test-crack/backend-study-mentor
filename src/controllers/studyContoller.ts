// This controller is for youtube video transcripts and study material generation
import { Request, Response } from "express";
import { getVideoIdFromUrl, fetchTranscript, mergeShortSegments } from "../services/transcriptService";


/**
 * Extract transcript from YouTube video
 */
export async function extractTranscript(req: Request, res: Response) {
  try {
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
    
    console.log("Transcript fetched successfully:", result);
    
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
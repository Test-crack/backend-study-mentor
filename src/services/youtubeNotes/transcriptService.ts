import { parseStringPromise } from 'xml2js';

/**
 * Transcript segment shape used by most transcript libs:
 * { text: string, offset?: number, duration?: number }
 */
export type TranscriptSegment = {
  text: string;
  offset?: number;   // start time in seconds
  duration?: number; // duration in seconds
};

export type TranscriptResult = {
  success: true;
  transcript: TranscriptSegment[];
  videoId: string;
  method?: string; // Which method was used to fetch
} | {
  success: false;
  error: string;
  code: 'NO_TRANSCRIPT' | 'FETCH_ERROR' | 'INVALID_VIDEO' | 'LIBRARY_ERROR';
};

interface Caption {
  caption: string;
  startTime: number;
  endTime: number;
}

/**
 * Extract video ID from various YouTube URL formats
 */
export function getVideoIdFromUrl(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  console.log("URL is ", url);
  console.log("host is ",host);
  if (host === "youtu.be") {
    // pathname like "/dQw4w9WgXcQ" or "/dQw4w9WgXcQ/..."
    const id = url.pathname.replace(/^\/+/, "").split("/")[0];
    console.log("id is", id);
    return id || null;
  }
  // covers youtube.com, www.youtube.com, m.youtube.com, sub.youtube.com
  if (host.endsWith("youtube.com")) {
    return url.searchParams.get("v");
  }
  return null;
}



/**
 * Method 1: Direct YouTube API approach (most reliable)
 * Fetches captions using YouTube's internal API
 */
async function fetchTranscriptMethod1(videoId: string, language: string = "en"): Promise<Caption[]> {
  console.log(`[Method 1] Attempting direct YouTube API for ${videoId}`);
  
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  
  // Step 1: Get the page HTML to extract API key
  const html = await fetch(videoUrl).then(res => res.text());
  const apiKeyMatch = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
  
  if (!apiKeyMatch) {
    throw new Error("INNERTUBE_API_KEY not found in page HTML");
  }
  
  const apiKey = apiKeyMatch[1];
  
  // Step 2: Get player data with captions info
  const playerData = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      context: {
        client: {
          clientName: "ANDROID",
          clientVersion: "20.10.38"
        }
      },
      videoId
    })
  }).then(res => res.json());
  
  // Step 3: Extract caption tracks
  const tracks = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  
  if (!tracks || tracks.length === 0) {
    throw new Error("No captions found in player data");
  }
  
  // Find track for requested language or fallback to first available
  let track = tracks.find((t: any) => t.languageCode === language);
  if (!track) {
    console.log(`[Method 1] Language ${language} not found, using ${tracks[0].languageCode}`);
    track = tracks[0];
  }
  
  // Step 4: Fetch and parse caption XML
  const baseUrl = track.baseUrl.replace(/&fmt=\w+$/, "");
  const xml = await fetch(baseUrl).then(res => res.text());
  
  if (!xml || xml.length === 0) {
    throw new Error("Empty caption XML received");
  }
  
  const parsed = await parseStringPromise(xml);
  
  if (!parsed?.transcript?.text) {
    throw new Error("Invalid caption XML structure");
  }
  
  return parsed.transcript.text.map((entry: any) => ({
    caption: entry._,
    startTime: parseFloat(entry.$.start),
    endTime: parseFloat(entry.$.start) + parseFloat(entry.$.dur)
  }));
}

/**
 * Method 2: Alternative scraping method (fallback)
 * TODO: Implement alternative method if needed
 */
async function fetchTranscriptMethod2(videoId: string, language: string = "en"): Promise<Caption[]> {
  console.log(`[Method 2] Not implemented yet for ${videoId}`);
  throw new Error("Method 2 not implemented");
}

/**
 * Method 3: Whisper API for speech-to-text (last resort)
 * TODO: Implement Whisper integration
 */
async function fetchTranscriptMethod3(videoId: string): Promise<Caption[]> {
  console.log(`[Method 3] Whisper API not implemented yet for ${videoId}`);
  throw new Error("Method 3 (Whisper) not implemented");
}

/**
 * Main transcript fetching function with fallback chain
 * Tries multiple methods in order until one succeeds
 */
export async function fetchTranscript(videoId: string): Promise<TranscriptResult> {
  console.log(`Fetching transcript for videoId: ${videoId}`);
  
  const language = process.env.YT_LANG || 'en';
  const methods = [
    { name: 'Direct YouTube API', fn: () => fetchTranscriptMethod1(videoId, language) },
    { name: 'Alternative Scraper', fn: () => fetchTranscriptMethod2(videoId, language) },
    { name: 'Whisper Speech-to-Text', fn: () => fetchTranscriptMethod3(videoId) }
  ];
  
  let lastError: Error | null = null;
  
  // Try each method in sequence
  for (const method of methods) {
    try {
      console.log(`[Transcript] Trying: ${method.name}`);
      const captions = await method.fn();
      
      if (!captions || captions.length === 0) {
        console.log(`[Transcript] ${method.name} returned empty captions`);
        continue;
      }
      
      // Convert to TranscriptSegment format
      const transcript: TranscriptSegment[] = captions.map(cap => ({
        text: cap.caption.trim(),
        offset: cap.startTime,
        duration: cap.endTime - cap.startTime
      })).filter(s => s.text.length > 0);
      
      if (transcript.length === 0) {
        console.log(`[Transcript] ${method.name} produced no valid segments`);
        continue;
      }
      
      console.log(`✅ [Transcript] Success with ${method.name}: ${transcript.length} segments`);
      
      return {
        success: true,
        transcript,
        videoId,
        method: method.name
      };
      
    } catch (err: any) {
      console.log(`❌ [Transcript] ${method.name} failed: ${err.message}`);
      lastError = err;
      // Continue to next method
    }
  }
  
  // All methods failed
  console.error(`[Transcript] All methods failed for ${videoId}`);
  
  // Determine error code based on last error
  if (lastError?.message?.includes('Video unavailable') || 
      lastError?.message?.includes('not found') ||
      lastError?.message?.includes('Invalid video')) {
    return {
      success: false,
      error: "Video not found or unavailable. Please check the URL and try again.",
      code: 'INVALID_VIDEO'
    };
  }
  
  if (lastError?.message?.includes('No captions') ||
      lastError?.message?.includes('INNERTUBE_API_KEY not found')) {
    return {
      success: false,
      error: "Transcript not available for this video. The video may not have captions enabled.",
      code: 'NO_TRANSCRIPT'
    };
  }
  
  return {
    success: false,
    error: `Failed to fetch transcript: ${lastError?.message || 'All methods exhausted'}`,
    code: 'FETCH_ERROR'
  };
}



/**
 * Clean transcript text by removing/fixing common issues
 * - HTML entities (&amp;, &quot;, etc.)
 * - Music/sound notations ([Music], ♪, etc.)
 * - Extra whitespace
 * - Special characters that don't add value
 */
export function cleanTranscriptText(text: string): string {
  let cleaned = text;
  
  // Decode HTML entities
  cleaned = cleaned
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec));
  
  // Remove music/sound notations
  cleaned = cleaned
    .replace(/\[Music\]/gi, '')
    .replace(/\[Applause\]/gi, '')
    .replace(/\[Laughter\]/gi, '')
    .replace(/\[.*?\]/g, '') // Remove any other bracketed notations
    .replace(/♪/g, '')
    .replace(/🎵/g, '')
    .replace(/🎶/g, '');
  
  // Remove multiple spaces and trim
  cleaned = cleaned
    .replace(/\s+/g, ' ')
    .trim();
  
  return cleaned;
}

/**
 * Clean all segments in a transcript array
 */
export function cleanTranscriptSegments(segments: TranscriptSegment[]): TranscriptSegment[] {
  return segments
    .map(segment => ({
      ...segment,
      text: cleanTranscriptText(segment.text)
    }))
    .filter(segment => segment.text.length > 0); // Remove empty segments after cleaning
}

/**
 * Merge adjacent transcript segments if their combined duration is less than maxDuration seconds
 */
export function mergeShortSegments(segments: TranscriptSegment[], maxDuration: number): TranscriptSegment[] {
  if (segments.length <= 1) return segments;
  
  const merged: TranscriptSegment[] = [];
  let current = { ...segments[0] };
  
  for (let i = 1; i < segments.length; i++) {
    const next = segments[i];
    const currentDuration = current.duration ?? 0;
    const nextDuration = next.duration ?? 0;
    const combinedDuration = currentDuration + nextDuration;
    
    // If combined duration is less than maxDuration, merge the segments
    if (combinedDuration < maxDuration) {
      current.text += " " + next.text;
      current.duration = combinedDuration;
      // Keep the offset of the first segment
    } else {
      // Push current merged segment and start new one
      merged.push(current);
      current = { ...next };
    }
  }
  
  // Don't forget to add the last segment
  merged.push(current);
  
  return merged;
}
import { fetchTranscriptMethod1 } from './transcriptMethods/method1-direct-api';
import { fetchTranscriptMethod2 } from './transcriptMethods/method2-ytdlp';

/**
 * Transcript segment shape
 */
export type TranscriptSegment = {
  text: string;
  offset?: number;
  duration?: number;
};

export type TranscriptResult = {
  success: true;
  transcript: TranscriptSegment[];
  videoId: string;
  method?: string;
} | {
  success: false;
  error: string;
  code: 'NO_TRANSCRIPT' | 'FETCH_ERROR' | 'INVALID_VIDEO' | 'LIBRARY_ERROR' | 'CLIENT_FALLBACK_REQUIRED';
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
  
  if (host === "youtu.be") {
    const id = url.pathname.replace(/^\/+/, "").split("/")[0];
    return id || null;
  }
  
  if (host.endsWith("youtube.com")) {
    return url.searchParams.get("v");
  }
  
  return null;
}



/**
 * Main transcript fetching function with fallback chain
 */
export async function fetchTranscript(videoId: string): Promise<TranscriptResult> {
  console.log(`Fetching transcript for videoId: ${videoId}`);
  
  const language = process.env.YT_LANG || 'en';
  const methods = [
    { name: 'Direct YouTube API', fn: () => fetchTranscriptMethod1(videoId, language) },
    { name: 'yt-dlp', fn: () => fetchTranscriptMethod2(videoId, language) },
    // { name: 'Client-Assisted Fallback', fn: () => fetchTranscriptMethod4(videoId) },
  ];
  
  let lastError: Error | null = null;
  
  for (const method of methods) {
    try {
      console.log(`[Transcript] Trying: ${method.name}`);
      const captions = await method.fn();
      
      if (!captions || captions.length === 0) {
        console.log(`[Transcript] ${method.name} returned empty captions`);
        continue;
      }
      
      const transcript: TranscriptSegment[] = captions.map((cap: Caption) => ({
        text: cap.caption.trim(),
        offset: cap.startTime,
        duration: cap.endTime - cap.startTime
      })).filter((s: TranscriptSegment) => s.text.length > 0);
      
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
      
      // Check if this is the client fallback signal
      if (err.message === 'CLIENT_FALLBACK_REQUIRED') {
        console.log(`[Transcript] 🔄 Requesting client-side assistance`);
        return {
          success: false,
          error: 'Server cannot fetch transcript. Client assistance required.',
          code: 'CLIENT_FALLBACK_REQUIRED'
        };
      }
      
      lastError = err;
    }
  }
  
  console.error(`[Transcript] All methods failed for ${videoId}`);
  
  if (lastError?.message?.includes('Video unavailable') || 
      lastError?.message?.includes('not found') ||
      lastError?.message?.includes('Invalid video')) {
    return {
      success: false,
      error: "Video not found or unavailable.",
      code: 'INVALID_VIDEO'
    };
  }
  
  if (lastError?.message?.includes('No captions') ||
      lastError?.message?.includes('INNERTUBE_API_KEY not found')) {
    return {
      success: false,
      error: "Transcript not available for this video.",
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
 * Clean transcript text
 */
export function cleanTranscriptText(text: string): string {
  let cleaned = text;
  
  cleaned = cleaned
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_match, dec) => String.fromCharCode(dec));
  
  cleaned = cleaned
    .replace(/\[Music\]/gi, '')
    .replace(/\[Applause\]/gi, '')
    .replace(/\[Laughter\]/gi, '')
    .replace(/\[.*?\]/g, '')
    .replace(/♪/g, '')
    .replace(/🎵/g, '')
    .replace(/🎶/g, '');
  
  cleaned = cleaned
    .replace(/\s+/g, ' ')
    .trim();
  
  return cleaned;
}

/**
 * Clean all segments
 */
export function cleanTranscriptSegments(segments: TranscriptSegment[]): TranscriptSegment[] {
  return segments
    .map(segment => ({
      ...segment,
      text: cleanTranscriptText(segment.text)
    }))
    .filter(segment => segment.text.length > 0);
}

/**
 * Merge short segments
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
    
    if (combinedDuration < maxDuration) {
      current.text += " " + next.text;
      current.duration = combinedDuration;
    } else {
      merged.push(current);
      current = { ...next };
    }
  }
  
  merged.push(current);
  return merged;
}
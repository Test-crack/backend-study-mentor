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
  console.log(`[Method 1] Starting for videoId: ${videoId}`);
  
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  
  // Browser-like headers to avoid being blocked by YouTube
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
  };
  
  try {
    // Step 1: Get the page HTML to extract API key
    console.log(`[Method 1] Step 1: Fetching video page...`);
    const htmlResponse = await fetch(videoUrl, { headers });
    console.log(`[Method 1] Step 1: Response status: ${htmlResponse.status}`);
    
    if (!htmlResponse.ok) {
      throw new Error(`Failed to fetch video page: ${htmlResponse.status} ${htmlResponse.statusText}`);
    }
    
    const html = await htmlResponse.text();
    console.log(`[Method 1] Step 1: Received HTML (${html.length} bytes)`);
    
    const apiKeyMatch = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
    
    if (!apiKeyMatch) {
      console.error(`[Method 1] Step 1: INNERTUBE_API_KEY not found in HTML`);
      throw new Error("INNERTUBE_API_KEY not found in page HTML");
    }
    
    const apiKey = apiKeyMatch[1];
    console.log(`[Method 1] Step 1: Extracted API key: ${apiKey.substring(0, 10)}...`);
    
    // Step 2: Get player data with captions info
    // Try WEB client first (most reliable for captions)
    console.log(`[Method 1] Step 2: Fetching player data with WEB client...`);
    let playerResponse = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${apiKey}`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "User-Agent": headers['User-Agent'],
        "Origin": "https://www.youtube.com",
        "Referer": videoUrl,
        "X-YouTube-Client-Name": "1",
        "X-YouTube-Client-Version": "2.20231219.04.00"
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: "WEB",
            clientVersion: "2.20231219.04.00",
            hl: "en",
            gl: "US",
            userAgent: headers['User-Agent']
          }
        },
        videoId,
        params: "CgIQAQ%3D%3D" // Enable captions
      })
    });
    
    console.log(`[Method 1] Step 2: Player API response status: ${playerResponse.status}`);
    
    if (!playerResponse.ok) {
      throw new Error(`Player API request failed: ${playerResponse.status} ${playerResponse.statusText}`);
    }
    
    let playerData = await playerResponse.json();
    console.log(`[Method 1] Step 2: Player data received`);
    
    // Step 3: Extract caption tracks
    console.log(`[Method 1] Step 3: Extracting caption tracks...`);
    let tracks = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    
    // If WEB client didn't return captions, try ANDROID client as fallback
    if (!tracks || tracks.length === 0) {
      console.log(`[Method 1] Step 3: WEB client returned no captions, trying ANDROID client...`);
      
      const androidResponse = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${apiKey}`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "User-Agent": headers['User-Agent']
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: "ANDROID",
              clientVersion: "19.09.37",
              androidSdkVersion: 30,
              hl: "en",
              gl: "US"
            }
          },
          videoId
        })
      });
      
      if (androidResponse.ok) {
        playerData = await androidResponse.json();
        tracks = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        console.log(`[Method 1] Step 3: ANDROID client returned ${tracks?.length || 0} tracks`);
      }
    }
    
    if (!tracks || tracks.length === 0) {
      console.error(`[Method 1] Step 3: No caption tracks found in either client. Player data structure:`, JSON.stringify(playerData?.captions || {}, null, 2));
      throw new Error("No captions found in player data");
    }
    
    console.log(`[Method 1] Step 3: Found ${tracks.length} caption track(s)`);
    
    // Find track for requested language or fallback to first available
    let track = tracks.find((t: any) => t.languageCode === language);
    if (!track) {
      console.log(`[Method 1] Step 3: Language ${language} not found, using ${tracks[0].languageCode}`);
      track = tracks[0];
    }
    
    console.log(`[Method 1] Step 3: Using track: ${track.languageCode}`);
    
    // Step 4: Fetch and parse caption XML
    console.log(`[Method 1] Step 4: Fetching caption XML...`);
    const baseUrl = track.baseUrl.replace(/&fmt=\w+$/, "");
    const xmlResponse = await fetch(baseUrl, { headers });
    
    console.log(`[Method 1] Step 4: XML response status: ${xmlResponse.status}`);
    
    if (!xmlResponse.ok) {
      throw new Error(`Failed to fetch caption XML: ${xmlResponse.status} ${xmlResponse.statusText}`);
    }
    
    const xml = await xmlResponse.text();
    console.log(`[Method 1] Step 4: Received XML (${xml.length} bytes)`);
    
    if (!xml || xml.length === 0) {
      throw new Error("Empty caption XML received");
    }
    
    const parsed = await parseStringPromise(xml);
    
    if (!parsed?.transcript?.text) {
      console.error(`[Method 1] Step 4: Invalid XML structure. Parsed:`, JSON.stringify(parsed, null, 2).substring(0, 500));
      throw new Error("Invalid caption XML structure");
    }
    
    console.log(`[Method 1] Step 4: Successfully parsed ${parsed.transcript.text.length} caption segments`);
    console.log(`[Method 1] ✅ SUCCESS - Returning ${parsed.transcript.text.length} captions`);
    
    return parsed.transcript.text.map((entry: any) => ({
      caption: entry._,
      startTime: parseFloat(entry.$.start),
      endTime: parseFloat(entry.$.start) + parseFloat(entry.$.dur)
    }));
    
  } catch (error: any) {
    console.error(`[Method 1] ❌ FAILED - Error: ${error.message}`);
    console.error(`[Method 1] Error stack:`, error.stack);
    throw error;
  }
}

/**
 * Method 2: Not implemented - placeholder
 */
async function fetchTranscriptMethod2(_videoId: string, _language: string = "en"): Promise<Caption[]> {
  throw new Error("Method 2 not implemented");
}

/**
 * Method 3: Not implemented - placeholder
 */
async function fetchTranscriptMethod3(_videoId: string): Promise<Caption[]> {
  throw new Error("Method 3 not implemented");
}

/**
 * Main transcript fetching function with fallback chain
 * Tries multiple methods in order until one succeeds
 */
export async function fetchTranscript(videoId: string): Promise<TranscriptResult> {
  console.log(`Fetching transcript for videoId: ${videoId}`);
  
  const language = process.env.YT_LANG || 'en';
  const methods = [
    { name: 'Direct YouTube API', fn: () => fetchTranscriptMethod1(videoId, language) }
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
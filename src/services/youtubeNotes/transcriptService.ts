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
  
  // More realistic browser-like headers to avoid being blocked by YouTube
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Cache-Control': 'max-age=0',
  };
  
  try {
    // Step 1: Get the page HTML to extract API key
    console.log(`[Method 1] Step 1: Fetching video page...`);
    
    // Add small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
    
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
        "X-YouTube-Client-Version": "2.20241219.01.00",
        "X-Origin": "https://www.youtube.com",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin"
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: "WEB",
            clientVersion: "2.20241219.01.00",
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
    
    // If WEB client didn't return captions, try multiple fallback clients
    if (!tracks || tracks.length === 0) {
      console.log(`[Method 1] Step 3: WEB client returned no captions, trying fallback clients...`);
      
      // Try iOS client (often works when others fail)
      const iosResponse = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${apiKey}`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "User-Agent": "com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X;)"
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: "IOS",
              clientVersion: "19.29.1",
              deviceMake: "Apple",
              deviceModel: "iPhone16,2",
              hl: "en",
              gl: "US",
              osName: "iOS",
              osVersion: "17.5.1.21F90"
            }
          },
          videoId
        })
      });
      
      if (iosResponse.ok) {
        playerData = await iosResponse.json();
        tracks = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        console.log(`[Method 1] Step 3: iOS client returned ${tracks?.length || 0} tracks`);
      }
      
      // If iOS didn't work, try ANDROID client
      if (!tracks || tracks.length === 0) {
        console.log(`[Method 1] Step 3: iOS failed, trying ANDROID client...`);
        
        const androidResponse = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${apiKey}`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "User-Agent": "com.google.android.youtube/19.29.37 (Linux; U; Android 13) gzip"
          },
          body: JSON.stringify({
            context: {
              client: {
                clientName: "ANDROID",
                clientVersion: "19.29.37",
                androidSdkVersion: 33,
                hl: "en",
                gl: "US",
                osName: "Android",
                osVersion: "13"
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
      
      // Last resort: Try TV client (TVHTML5_SIMPLY_EMBEDDED_PLAYER)
      if (!tracks || tracks.length === 0) {
        console.log(`[Method 1] Step 3: ANDROID failed, trying TV embedded client...`);
        
        const tvResponse = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${apiKey}`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "User-Agent": headers['User-Agent']
          },
          body: JSON.stringify({
            context: {
              client: {
                clientName: "TVHTML5_SIMPLY_EMBEDDED_PLAYER",
                clientVersion: "2.0",
                hl: "en",
                gl: "US"
              },
              thirdParty: {
                embedUrl: "https://www.youtube.com"
              }
            },
            videoId
          })
        });
        
        if (tvResponse.ok) {
          playerData = await tvResponse.json();
          tracks = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
          console.log(`[Method 1] Step 3: TV client returned ${tracks?.length || 0} tracks`);
        }
      }
    }
    
    if (!tracks || tracks.length === 0) {
      // Log more detailed info for debugging
      console.error(`[Method 1] Step 3: No caption tracks found in any client.`);
      console.error(`[Method 1] Step 3: Player response keys:`, Object.keys(playerData || {}));
      console.error(`[Method 1] Step 3: Captions object:`, JSON.stringify(playerData?.captions || {}, null, 2));
      
      // Check if video has playability issues
      if (playerData?.playabilityStatus) {
        console.error(`[Method 1] Step 3: Playability status:`, playerData.playabilityStatus.status);
        console.error(`[Method 1] Step 3: Playability reason:`, playerData.playabilityStatus.reason);
      }
      
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
 * Method 2: yt-dlp approach (most reliable on servers)
 * Uses yt-dlp command-line tool to extract subtitles
 * Requires yt-dlp to be installed on the system
 */
async function fetchTranscriptMethod2(videoId: string, language: string = "en"): Promise<Caption[]> {
  console.log(`[Method 2] Starting yt-dlp for videoId: ${videoId}`);
  
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);
  const fs = await import('fs');
  const path = await import('path');
  const os = await import('os');
  
  // Create temp directory for subtitle files
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yt-transcript-'));
  const subtitleFile = path.join(tempDir, `${videoId}.json`);
  
  // Path to YouTube cookies file
  const cookiesPath = path.join(process.cwd(), 'cookies', 'youtube.txt');
  
  try {
    console.log(`[Method 2] Step 1: Checking yt-dlp availability...`);
    
    // Check if yt-dlp is installed (try both direct command and python module)
    let ytDlpCommand = 'yt-dlp';
    try {
      await execAsync('yt-dlp --version');
      console.log(`[Method 2] Step 1: yt-dlp command is available`);
    } catch (error) {
      // Try python module approach
      try {
        await execAsync('python -m yt_dlp --version');
        ytDlpCommand = 'python -m yt_dlp';
        console.log(`[Method 2] Step 1: yt-dlp python module is available`);
      } catch (pythonError) {
        throw new Error("yt-dlp is not installed. Install it with: pip install yt-dlp");
      }
    }
    
    // Check if cookies file exists
    const hasCookies = fs.existsSync(cookiesPath);
    if (hasCookies) {
      console.log(`[Method 2] Step 1: Found cookies file at ${cookiesPath}`);
    } else {
      console.log(`[Method 2] Step 1: No cookies file found, proceeding without authentication`);
    }
    
    console.log(`[Method 2] Step 2: Extracting subtitles with yt-dlp...`);
    
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    // Build yt-dlp command with cookies for authenticated session
    // --cookies: Use YouTube session cookies to bypass rate limits and consent walls
    // --write-auto-sub: Download auto-generated subtitles if available
    // --write-sub: Download manual subtitles
    // --sub-lang: Preferred subtitle language
    // --skip-download: Don't download the video
    // --sub-format: Format for subtitles (json3 gives us timestamps)
    // --no-warnings: Suppress warnings
    const cookiesArg = hasCookies ? `--cookies "${cookiesPath}"` : '';
    const command = `${ytDlpCommand} ${cookiesArg} --write-auto-sub --write-sub --sub-lang ${language} --skip-download --sub-format json3 --no-warnings --output "${subtitleFile}" "${videoUrl}"`;
    
    console.log(`[Method 2] Step 2: Running command with${hasCookies ? '' : 'out'} cookies...`);
    
    const { stdout, stderr } = await execAsync(command, {
      timeout: 60000, // 60 second timeout
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    });
    
    if (stderr && !stderr.includes('WARNING')) {
      console.log(`[Method 2] Step 2: stderr output:`, stderr);
    }
    
    console.log(`[Method 2] Step 3: Looking for subtitle files...`);
    
    // yt-dlp creates files like: videoId.en.json3 or videoId.en-US.json3
    const files = fs.readdirSync(tempDir);
    console.log(`[Method 2] Step 3: Found files:`, files);
    
    const jsonSubFile = files.find(f => f.endsWith('.json3'));
    
    if (!jsonSubFile) {
      throw new Error("No subtitle file generated by yt-dlp. Video may not have captions.");
    }
    
    const fullSubPath = path.join(tempDir, jsonSubFile);
    console.log(`[Method 2] Step 3: Reading subtitle file: ${jsonSubFile}`);
    
    const subtitleData = fs.readFileSync(fullSubPath, 'utf-8');
    const subtitleJson = JSON.parse(subtitleData);
    
    console.log(`[Method 2] Step 4: Parsing subtitle data...`);
    
    // yt-dlp json3 format structure
    const captions: Caption[] = [];
    
    if (subtitleJson.events) {
      // json3 format has events array
      for (const event of subtitleJson.events) {
        if (event.segs) {
          // Each event has segments with text
          const text = event.segs.map((seg: any) => seg.utf8 || '').join('');
          if (text.trim()) {
            const startTime = (event.tStartMs || 0) / 1000; // Convert ms to seconds
            const duration = (event.dDurationMs || 0) / 1000;
            captions.push({
              caption: text.trim(),
              startTime: startTime,
              endTime: startTime + duration
            });
          }
        }
      }
    }
    
    if (captions.length === 0) {
      throw new Error("No captions found in subtitle file");
    }
    
    console.log(`[Method 2] ✅ SUCCESS - Extracted ${captions.length} captions`);
    
    return captions;
    
  } catch (error: any) {
    console.error(`[Method 2] ❌ FAILED - Error: ${error.message}`);
    console.error(`[Method 2] Error stack:`, error.stack);
    throw error;
  } finally {
    // Cleanup temp directory
    try {
      console.log(`[Method 2] Cleaning up temp directory: ${tempDir}`);
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (cleanupError) {
      console.error(`[Method 2] Failed to cleanup temp directory:`, cleanupError);
    }
  }
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
    { name: 'yt-dlp', fn: () => fetchTranscriptMethod2(videoId, language) },
    { name: 'Direct YouTube API', fn: () => fetchTranscriptMethod1(videoId, language) },
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
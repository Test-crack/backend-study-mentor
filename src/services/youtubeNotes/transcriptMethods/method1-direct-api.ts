import { parseStringPromise } from 'xml2js';

interface Caption {
  caption: string;
  startTime: number;
  endTime: number;
}

/**
 * Method 1: Direct YouTube API approach
 * Fetches captions using YouTube's internal API
 */
export async function fetchTranscriptMethod1(videoId: string, language: string = "en"): Promise<Caption[]> {
  console.log(`[Method 1] Starting for videoId: ${videoId}`);
  
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
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
    console.log(`[Method 1] Step 1: Fetching video page...`);
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
      throw new Error("INNERTUBE_API_KEY not found in page HTML");
    }
    
    const apiKey = apiKeyMatch[1];
    console.log(`[Method 1] Step 1: Extracted API key`);
    
    console.log(`[Method 1] Step 2: Fetching player data with WEB client...`);
    let playerResponse = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${apiKey}`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "User-Agent": headers['User-Agent'],
        "Origin": "https://www.youtube.com",
        "Referer": videoUrl,
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: "WEB",
            clientVersion: "2.20241219.01.00",
            hl: "en",
            gl: "US",
          }
        },
        videoId,
      })
    });
    
    if (!playerResponse.ok) {
      throw new Error(`Player API request failed: ${playerResponse.status}`);
    }
    
    let playerData = await playerResponse.json();
    let tracks = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    
    if (!tracks || tracks.length === 0) {
      console.log(`[Method 1] WEB client failed, trying iOS...`);
      const iosResponse = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: {
            client: {
              clientName: "IOS",
              clientVersion: "19.29.1",
              deviceMake: "Apple",
              deviceModel: "iPhone16,2",
            }
          },
          videoId
        })
      });
      
      if (iosResponse.ok) {
        playerData = await iosResponse.json();
        tracks = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      }
    }
    
    if (!tracks || tracks.length === 0) {
      throw new Error("No captions found in player data");
    }
    
    let track = tracks.find((t: any) => t.languageCode === language) || tracks[0];
    console.log(`[Method 1] Using track: ${track.languageCode}`);
    
    const baseUrl = track.baseUrl.replace(/&fmt=\w+$/, "");
    const xmlResponse = await fetch(baseUrl, { headers });
    
    if (!xmlResponse.ok) {
      throw new Error(`Failed to fetch caption XML: ${xmlResponse.status}`);
    }
    
    const xml = await xmlResponse.text();
    const parsed = await parseStringPromise(xml);
    
    if (!parsed?.transcript?.text) {
      throw new Error("Invalid caption XML structure");
    }
    
    console.log(`[Method 1] ✅ SUCCESS - ${parsed.transcript.text.length} captions`);
    
    return parsed.transcript.text.map((entry: any) => ({
      caption: entry._,
      startTime: parseFloat(entry.$.start),
      endTime: parseFloat(entry.$.start) + parseFloat(entry.$.dur)
    }));
    
  } catch (error: any) {
    console.error(`[Method 1] ❌ FAILED - ${error.message}`);
    throw error;
  }
}

import { transcribeAudio } from '../../speechToText.service';

interface Caption {
  caption: string;
  startTime: number;
  endTime: number;
}

/**
 * Method 3: Audio download + Gemini transcription
 * Downloads audio using yt-dlp and transcribes with Gemini API
 * Works even when captions are blocked
 */
export async function fetchTranscriptMethod3(videoId: string, language: string = "en"): Promise<Caption[]> {
  console.log(`[Method 3] Starting Gemini audio transcription for videoId: ${videoId}`);
  
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);
  const fs = await import('fs');
  const path = await import('path');
  const os = await import('os');
  
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yt-audio-'));
  const audioFileBase = path.join(tempDir, videoId);
  const cookiesPath = path.join(process.cwd(), 'cookies', 'youtube.txt');
  
  try {
    console.log(`[Method 3] Step 1: Checking yt-dlp availability...`);
    
    let ytDlpCommand = 'yt-dlp';
    const ytDlpPaths = [
      '/home/developer_user/.local/bin/yt-dlp',
      'yt-dlp',
      '/usr/local/bin/yt-dlp',
      'python -m yt_dlp'
    ];
    
    let foundVersion = null;
    for (const cmd of ytDlpPaths) {
      try {
        const { stdout } = await execAsync(`${cmd} --version`);
        foundVersion = stdout.trim();
        ytDlpCommand = cmd;
        console.log(`[Method 3] Found yt-dlp: ${cmd} (v${foundVersion})`);
        break;
      } catch (error) {
        // Try next
      }
    }
    
    if (!foundVersion) {
      throw new Error("yt-dlp not installed");
    }
    
    const hasCookies = fs.existsSync(cookiesPath);
    if (hasCookies) {
      const stats = fs.statSync(cookiesPath);
      const ageInDays = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60 * 24);
      console.log(`[Method 3] Cookies found (${ageInDays.toFixed(0)} days old)`);
    }
    
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const verboseArg = process.env.YT_DLP_VERBOSE === 'true' ? '--verbose' : '--no-warnings';
    const proxyArg = process.env.YT_DLP_PROXY ? `--proxy "${process.env.YT_DLP_PROXY}"` : '';
    
    console.log(`[Method 3] Step 2: Downloading audio...`);
    
    // Try with ffmpeg first (best quality), fallback to direct download
    let audioFile: string | null = null;
    let command = `${ytDlpCommand} ${proxyArg} -f bestaudio --extract-audio --audio-format mp3 --audio-quality 0 ${verboseArg} -o "${audioFileBase}.%(ext)s" "${videoUrl}"`;
    
    console.log(`[Method 3] Attempt 1: WITH ffmpeg conversion (no cookies)`);
    
    try {
      await execAsync(command, {
        timeout: 120000,
        maxBuffer: 50 * 1024 * 1024
      });
      audioFile = `${audioFileBase}.mp3`;
      console.log(`[Method 3] ✅ Audio downloaded with ffmpeg`);
    } catch (ffmpegError: any) {
      // Check if error is due to missing ffmpeg
      if (ffmpegError.message.includes('ffmpeg') || ffmpegError.message.includes('ffprobe')) {
        console.log(`[Method 3] ffmpeg not found, trying direct download...`);
        
        // Download without conversion - get the original audio format
        command = `${ytDlpCommand} ${proxyArg} -f bestaudio ${verboseArg} -o "${audioFileBase}.%(ext)s" "${videoUrl}"`;
        
        try {
          await execAsync(command, {
            timeout: 120000,
            maxBuffer: 50 * 1024 * 1024
          });
          
          // Find the downloaded file (could be .webm, .m4a, .opus, etc.)
          const files = fs.readdirSync(tempDir);
          const downloadedFile = files.find(f => f.startsWith(videoId));
          
          if (!downloadedFile) {
            throw new Error("Audio file was not created");
          }
          
          audioFile = path.join(tempDir, downloadedFile);
          console.log(`[Method 3] ✅ Audio downloaded (${path.extname(downloadedFile)})`);
        } catch (noCookieError: any) {
          // Try with cookies
          if (hasCookies) {
            console.log(`[Method 3] Retrying with cookies...`);
            command = `${ytDlpCommand} ${proxyArg} --cookies "${cookiesPath}" -f bestaudio ${verboseArg} -o "${audioFileBase}.%(ext)s" "${videoUrl}"`;
            
            await execAsync(command, {
              timeout: 120000,
              maxBuffer: 50 * 1024 * 1024
            });
            
            const files = fs.readdirSync(tempDir);
            const downloadedFile = files.find(f => f.startsWith(videoId));
            
            if (!downloadedFile) {
              throw new Error("Audio file was not created");
            }
            
            audioFile = path.join(tempDir, downloadedFile);
            console.log(`[Method 3] ✅ Audio downloaded with cookies (${path.extname(downloadedFile)})`);
          } else {
            throw noCookieError;
          }
        }
      } else {
        // Try with cookies for the ffmpeg version
        if (hasCookies) {
          console.log(`[Method 3] Attempt 2: WITH ffmpeg conversion (with cookies)`);
          command = `${ytDlpCommand} ${proxyArg} --cookies "${cookiesPath}" -f bestaudio --extract-audio --audio-format mp3 --audio-quality 0 ${verboseArg} -o "${audioFileBase}.%(ext)s" "${videoUrl}"`;
          
          await execAsync(command, {
            timeout: 120000,
            maxBuffer: 50 * 1024 * 1024
          });
          audioFile = `${audioFileBase}.mp3`;
          console.log(`[Method 3] ✅ Audio downloaded with ffmpeg and cookies`);
        } else {
          throw ffmpegError;
        }
      }
    }
    
    if (!audioFile || !fs.existsSync(audioFile)) {
      throw new Error("Audio file was not created");
    }
    
    const audioStats = fs.statSync(audioFile);
    console.log(`[Method 3] Audio file size: ${(audioStats.size / 1024 / 1024).toFixed(2)} MB`);
    
    // Check file size limit (Gemini has limits)
    const maxSizeMB = 20; // Conservative limit
    if (audioStats.size > maxSizeMB * 1024 * 1024) {
      throw new Error(`Audio file too large (${(audioStats.size / 1024 / 1024).toFixed(2)} MB). Max: ${maxSizeMB} MB`);
    }
    
    console.log(`[Method 3] Step 3: Transcribing with Gemini...`);
    const transcriptText = await transcribeAudio(audioFile, language);
    
    if (!transcriptText || transcriptText.trim().length === 0) {
      throw new Error("Gemini returned empty transcript");
    }
    
    console.log(`[Method 3] Transcript length: ${transcriptText.length} characters`);
    
    // Convert plain text to Caption format
    // Since we don't have timestamps, create a single caption
    const captions: Caption[] = [{
      caption: transcriptText.trim(),
      startTime: 0,
      endTime: 0 // Unknown duration
    }];
    
    console.log(`[Method 3] ✅ SUCCESS - Transcription complete`);
    return captions;
    
  } catch (error: any) {
    console.error(`[Method 3] ❌ FAILED - ${error.message}`);
    if (error.message.includes('data blocks') || error.message.includes('Sign in')) {
      throw new Error('YouTube bot detection. Update yt-dlp or refresh cookies');
    }
    throw error;
  } finally {
    try {
      const fs = await import('fs');
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

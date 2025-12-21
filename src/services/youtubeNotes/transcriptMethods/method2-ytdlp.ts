interface Caption {
  caption: string;
  startTime: number;
  endTime: number;
}

/**
 * Method 2: yt-dlp approach
 * Uses yt-dlp command-line tool to extract subtitles
 */
export async function fetchTranscriptMethod2(videoId: string, language: string = "en"): Promise<Caption[]> {
  console.log(`[Method 2] Starting yt-dlp for videoId: ${videoId}`);
  
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);
  const fs = await import('fs');
  const path = await import('path');
  const os = await import('os');
  
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yt-transcript-'));
  const subtitleFile = path.join(tempDir, `${videoId}.json`);
  const cookiesPath = path.join(process.cwd(), 'cookies', 'youtube.txt');
  
  try {
    console.log(`[Method 2] Step 1: Checking yt-dlp availability...`);
    
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
        console.log(`[Method 2] Found yt-dlp: ${cmd} (v${foundVersion})`);
        break;
      } catch (error) {
        // Try next
      }
    }
    
    if (!foundVersion) {
      throw new Error("yt-dlp not installed");
    }
    
    if (foundVersion && !foundVersion.startsWith('2025')) {
      console.warn(`[Method 2] ⚠️ yt-dlp v${foundVersion} is outdated`);
    }
    
    const hasCookies = fs.existsSync(cookiesPath);
    if (hasCookies) {
      const stats = fs.statSync(cookiesPath);
      const ageInDays = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60 * 24);
      console.log(`[Method 2] Cookies found (${ageInDays.toFixed(0)} days old)`);
    }
    
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const verboseArg = process.env.YT_DLP_VERBOSE === 'true' ? '--verbose' : '--no-warnings';
    const proxyArg = process.env.YT_DLP_PROXY ? `--proxy "${process.env.YT_DLP_PROXY}"` : '';
    
    let command = `${ytDlpCommand} ${proxyArg} --write-auto-sub --write-sub --sub-lang ${language} --skip-download --sub-format json3 ${verboseArg} --output "${subtitleFile}" "${videoUrl}"`;
    
    console.log(`[Method 2] Attempt 1: WITHOUT cookies`);
    let execResult;
    
    try {
      execResult = await execAsync(command, {
        timeout: 60000,
        maxBuffer: 10 * 1024 * 1024
      });
      console.log(`[Method 2] ✅ Success without cookies`);
    } catch (noCookieError: any) {
      if (hasCookies) {
        console.log(`[Method 2] Attempt 2: WITH cookies`);
        command = `${ytDlpCommand} ${proxyArg} --cookies "${cookiesPath}" --write-auto-sub --write-sub --sub-lang ${language} --skip-download --sub-format json3 ${verboseArg} --output "${subtitleFile}" "${videoUrl}"`;
        execResult = await execAsync(command, {
          timeout: 60000,
          maxBuffer: 10 * 1024 * 1024
        });
        console.log(`[Method 2] ✅ Success with cookies`);
      } else {
        throw noCookieError;
      }
    }
    
    const files = fs.readdirSync(tempDir);
    const jsonSubFile = files.find(f => f.endsWith('.json3'));
    
    if (!jsonSubFile) {
      throw new Error("No subtitle file generated");
    }
    
    const fullSubPath = path.join(tempDir, jsonSubFile);
    const subtitleData = fs.readFileSync(fullSubPath, 'utf-8');
    const subtitleJson = JSON.parse(subtitleData);
    
    const captions: Caption[] = [];
    
    if (subtitleJson.events) {
      for (const event of subtitleJson.events) {
        if (event.segs) {
          const text = event.segs.map((seg: any) => seg.utf8 || '').join('');
          if (text.trim()) {
            const startTime = (event.tStartMs || 0) / 1000;
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
    
    console.log(`[Method 2] ✅ SUCCESS - ${captions.length} captions`);
    return captions;
    
  } catch (error: any) {
    console.error(`[Method 2] ❌ FAILED - ${error.message}`);
    if (error.message.includes('data blocks') || error.message.includes('Sign in')) {
      throw new Error('YouTube bot detection. Update yt-dlp, install deno, refresh cookies');
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

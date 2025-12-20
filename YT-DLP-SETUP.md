# yt-dlp Setup Guide with Cookies Authentication

## What Changed

Method 2 now uses **yt-dlp with YouTube cookies** for authenticated requests. This provides:
- ✅ Uses your real YouTube session
- ✅ Bypasses rate-limiting (HTTP 429 errors)
- ✅ Bypasses consent walls
- ✅ Stable for demos & production
- ✅ No need for Android client workarounds

**New Features:**
- Automatic detection of yt-dlp (both command and Python module)
- Uses YouTube cookies for authenticated session
- Graceful fallback if cookies not available
- Better error handling and logging

## Installation Steps

### Step 1: Install yt-dlp

#### Option 1: Using pip (Recommended)
```bash
pip install yt-dlp
```

#### Option 2: Using pip3
```bash
pip3 install yt-dlp
```

#### Option 3: Direct download (if pip not available)
```bash
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
```

#### Option 4: Using package manager (Ubuntu/Debian)
```bash
sudo apt update
sudo apt install yt-dlp
```

### Step 2: Export YouTube Cookies

You need to export your YouTube cookies to a file. This allows yt-dlp to use your authenticated session.

#### Method A: Using Browser Extension (Easiest)

1. Install a cookie export extension:
   - Chrome/Edge: [Get cookies.txt LOCALLY](https://chrome.google.com/webstore/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc)
   - Firefox: [cookies.txt](https://addons.mozilla.org/en-US/firefox/addon/cookies-txt/)

2. Go to YouTube.com and make sure you're logged in

3. Click the extension icon and export cookies for youtube.com

4. Save the file as `youtube.txt`

#### Method B: Using yt-dlp (Alternative)

```bash
# This will extract cookies from your browser
yt-dlp --cookies-from-browser chrome --print-traffic https://www.youtube.com/
```

### Step 3: Place Cookies File

Create a `cookies` directory in your project root and place the `youtube.txt` file there:

```
backend-study-mentor/
├── cookies/
│   └── youtube.txt    ← Your YouTube cookies here
├── src/
├── dist/
└── package.json
```

**Important:** Add `cookies/` to your `.gitignore` to avoid committing sensitive session data!

```bash
echo "cookies/" >> .gitignore
```

### Step 4: Verify Installation

```bash
# Check yt-dlp is installed
yt-dlp --version
# OR
python -m yt_dlp --version

# Test with cookies
yt-dlp --cookies cookies/youtube.txt --write-auto-sub --write-sub --sub-lang en --skip-download --sub-format json3 --output "test" "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```

## How It Works

1. **Method 1** (Direct YouTube API) tries first with multiple client types (WEB, iOS, Android, TV)
2. If Method 1 fails, **Method 2** (yt-dlp with cookies) automatically kicks in
3. yt-dlp uses your YouTube session cookies to authenticate
4. Downloads subtitles in JSON3 format with precise timestamps
5. Temp files are automatically cleaned up after extraction

## Benefits of Using Cookies

- **No Rate Limiting**: YouTube treats requests as coming from your authenticated session
- **No Consent Walls**: Bypasses GDPR/regional consent requirements
- **More Reliable**: Works consistently across different server environments
- **Production Ready**: Stable solution for production deployments
- **No Workarounds Needed**: No need for Android client or sleep delays

## Security Notes

⚠️ **Important Security Considerations:**

1. **Never commit cookies to git** - Add `cookies/` to `.gitignore`
2. **Cookies contain session tokens** - Treat them like passwords
3. **Rotate cookies periodically** - Export fresh cookies every few months
4. **Use service account** - Consider using a dedicated YouTube account for production
5. **Server deployment** - Use environment variables or secrets management for production

## Testing

After setup, restart your backend and try a video:

```
[Transcript] Trying: Direct YouTube API
❌ [Transcript] Direct YouTube API failed: No captions found
[Transcript] Trying: yt-dlp
[Method 2] Starting yt-dlp for videoId: MPfZhgLiK6w
[Method 2] Step 1: yt-dlp python module is available
[Method 2] Step 1: Found cookies file at /path/to/cookies/youtube.txt
[Method 2] Step 2: Extracting subtitles with yt-dlp...
[Method 2] Step 2: Running command with cookies...
✅ [Method 2] SUCCESS - Extracted 234 captions
```

## Troubleshooting

### yt-dlp not found
- Make sure it's in your PATH
- Try using full path: `/usr/local/bin/yt-dlp`
- The code automatically tries `python -m yt_dlp` as fallback

### Cookies not working
- Make sure you're logged into YouTube before exporting
- Check cookies file format (should be Netscape format)
- Try exporting fresh cookies
- Verify file path: `cookies/youtube.txt` relative to project root

### Still getting 429 errors
- Cookies might be expired - export fresh ones
- Make sure cookies file is readable
- Check if YouTube account is in good standing

### Permission errors
- Ensure cookies file has read permissions
- Check temp directory is writable
- Verify user running the app has access to cookies file

## Deployment to Server

When deploying to your server:

1. Export cookies on your local machine (or server if you have a browser there)
2. Copy `cookies/youtube.txt` to your server
3. Make sure the file has proper permissions: `chmod 600 cookies/youtube.txt`
4. Ensure `cookies/` is in `.gitignore`
5. Consider using a dedicated YouTube account for production
6. Set up monitoring to detect when cookies expire

# Deployment Checklist for YouTube Transcript Feature

## Local Setup (Already Done ✅)

- [x] yt-dlp installed (`python -m yt_dlp`)
- [x] YouTube cookies exported to `cookies/youtube.txt`
- [x] `cookies/` added to `.gitignore`
- [x] Code built successfully
- [x] Tested locally with cookies

## Server Deployment Steps

### 1. Install yt-dlp on Server

```bash
# SSH into your server
ssh your-server

# Install yt-dlp
pip install yt-dlp
# OR
pip3 install yt-dlp

# Verify installation
python -m yt_dlp --version
```

### 2. Copy Cookies to Server

```bash
# From your local machine, copy cookies to server
scp cookies/youtube.txt your-server:/var/www/apps/backend/backend-study-mentor/cookies/

# OR manually create the file on server
ssh your-server
cd /var/www/apps/backend/backend-study-mentor
mkdir -p cookies
nano cookies/youtube.txt
# Paste the cookie content and save
```

### 3. Set Proper Permissions

```bash
# On server
cd /var/www/apps/backend/backend-study-mentor
chmod 600 cookies/youtube.txt
chown developer_user:developer_user cookies/youtube.txt
```

### 4. Deploy Code

```bash
# Push your code (cookies won't be included due to .gitignore)
git add .
git commit -m "Enhanced YouTube transcript with yt-dlp and cookies support"
git push

# On server, pull and build
ssh your-server
cd /var/www/apps/backend/backend-study-mentor
git pull
npm install
npm run build
```

### 5. Restart Backend

```bash
# Using PM2
pm2 restart backend

# Check logs
pm2 logs backend --lines 50
```

### 6. Test

Try the same video that was failing before (MPfZhgLiK6w):

```bash
# Watch logs in real-time
pm2 logs backend

# Make a request from your frontend or use curl
curl -X POST http://your-server/api/youtube/transcript \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=MPfZhgLiK6w"}'
```

## Expected Log Output

```
[Transcript] Trying: Direct YouTube API
[Method 1] Starting for videoId: MPfZhgLiK6w
...
❌ [Transcript] Direct YouTube API failed: No captions found
[Transcript] Trying: yt-dlp
[Method 2] Starting yt-dlp for videoId: MPfZhgLiK6w
[Method 2] Step 1: yt-dlp python module is available
[Method 2] Step 1: Found cookies file at /var/www/.../cookies/youtube.txt
[Method 2] Step 2: Extracting subtitles with yt-dlp...
[Method 2] Step 2: Running command with cookies...
[Method 2] Step 3: Found files: ['MPfZhgLiK6w.en.json3']
[Method 2] Step 4: Parsing subtitle data...
✅ [Method 2] SUCCESS - Extracted 234 captions
```

## Troubleshooting

### If yt-dlp not found on server:
```bash
which python
which python3
python -m yt_dlp --version
python3 -m yt_dlp --version
```

### If cookies not working:
```bash
# Check file exists
ls -la cookies/youtube.txt

# Check permissions
chmod 600 cookies/youtube.txt

# Test manually
python -m yt_dlp --cookies cookies/youtube.txt --write-auto-sub --skip-download --sub-format json3 "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```

### If still getting 429 errors:
- Export fresh cookies from your browser
- Make sure you're logged into YouTube when exporting
- Check if cookies file is in correct Netscape format
- Try using a different YouTube account

## Maintenance

- **Rotate cookies every 2-3 months** to avoid expiration
- **Monitor logs** for any yt-dlp failures
- **Keep yt-dlp updated**: `pip install --upgrade yt-dlp`
- **Consider using a dedicated YouTube account** for production

## Rollback Plan

If something goes wrong:

```bash
# Revert to previous commit
git revert HEAD
npm run build
pm2 restart backend
```

The system will still work without yt-dlp, it just won't have the fallback method.

# YouTube Transcript & Study Material Generation

## Overview
This module extracts transcripts from YouTube videos and generates AI-powered study materials using Gemini.

## Files
- `src/routes/ytStudyRoutes.ts` - Route definitions
- `src/controllers/ytStudyController.ts` - Request handlers
- `src/services/transcriptService.ts` - YouTube transcript fetching
- `src/services/summarizeService.ts` - AI study material generation

## API Endpoints

### 1. Extract Transcript
**POST** `/api/study/extract`

**Request:**
```json
{
  "url": "https://www.youtube.com/watch?v=VIDEO_ID"
}
```

**Response:**
```json
{
  "status": 200,
  "videoId": "VIDEO_ID",
  "transcript": [
    { "text": "...", "offset": 0, "duration": 5.2 }
  ],
  "message": "Transcript fetched successfully."
}
```

**Flow:**
1. Validates YouTube URL format
2. Extracts video ID from URL
3. Fetches transcript using `youtube-transcript` library
4. Merges short segments (< 5 seconds) for better readability
5. Returns sorted transcript array

**Error Codes:**
- `400` - Invalid URL or missing video ID
- `404` - No transcript available
- `502` - Fetch error from YouTube
- `500` - Unexpected server error

### 2. Generate Study Material
**POST** `/api/study/summarize`

**Request:**
```json
{
  "videoId": "VIDEO_ID",
  "transcript": [...],
  "language": "en" // optional
}
```

**Response:**
```json
{
  "status": 200,
  "videoId": "VIDEO_ID",
  "markdown": "# Study Notes\n\n...",
  "message": "Study material generated successfully."
}
```

**Flow:**
1. Validates videoId and transcript array
2. Calls `summarizeTranscript()` service
3. Uses Gemini AI to generate structured markdown notes
4. Returns formatted study material

## Key Features
- Automatic transcript merging for readability
- Multi-language support
- Structured markdown output
- Error handling with specific status codes

## Environment Variables
```
GEMINI_API_KEY=your_api_key_here
```

## Usage Example
```typescript
// 1. Extract transcript
const extractRes = await fetch('/api/study/extract', {
  method: 'POST',
  body: JSON.stringify({ url: 'https://youtube.com/watch?v=...' })
});
const { videoId, transcript } = await extractRes.json();

// 2. Generate study material
const summaryRes = await fetch('/api/study/summarize', {
  method: 'POST',
  body: JSON.stringify({ videoId, transcript })
});
const { markdown } = await summaryRes.json();
```

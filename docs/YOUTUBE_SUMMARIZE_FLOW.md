# YouTube Summarize Flow - Testing Guide

## Overview
The `/yt-study/summarize` endpoint provides a complete flow for generating study material from YouTube videos, extracting concepts, and linking them to authenticated users.

## Flow Steps

1. **Authentication**: User must be authenticated with a valid Bearer token
2. **Summary Generation**: Creates a markdown summary from the video transcript
3. **Concept Extraction**: Uses AI to identify domain, keywords, and learning objectives
4. **Database Storage**: 
   - Creates a `Concept` entry with the extracted information
   - Creates a `Content` entry with `contentType = 'YOUTUBE'`, `ytLink = videoId`, `path = null`
5. **User Linking**: Creates a `UserConcept` entry linking the authenticated user to the concept

## API Endpoint

```
POST /yt-study/summarize
```

### Headers
```
Authorization: Bearer <supabase_jwt_token>
Content-Type: application/json
```

### Request Body
```json
{
  "videoId": "dQw4w9WgXcQ",
  "transcript": [
    {
      "text": "Never gonna give you up",
      "offset": 0,
      "duration": 3.5
    },
    {
      "text": "Never gonna let you down",
      "offset": 3.5,
      "duration": 3.2
    }
  ],
  "language": "en",
  "title": "Rick Astley - Never Gonna Give You Up",
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
}
```

### Response
```json
{
  "status": 200,
  "videoId": "dQw4w9WgXcQ",
  "markdown": "# Study Material\n\n## Summary\n...",
  "concept": {
    "conceptId": "MUSIC.POP-CULTURE.001",
    "domain": "music",
    "keywords": ["pop", "80s", "music-video"],
    "learningObjective": "Students will be able to understand...",
    "userLinked": true
  },
  "message": "Study material generated successfully."
}
```

## Testing with cURL

### 1. Get a Supabase token first
You need to authenticate with Supabase to get a JWT token.

### 2. Test the summarize endpoint
```bash
curl -X POST http://localhost:3000/yt-study/summarize \
  -H "Authorization: Bearer YOUR_SUPABASE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "videoId": "dQw4w9WgXcQ",
    "transcript": [
      {"text": "Sample transcript text", "offset": 0, "duration": 5}
    ],
    "title": "Test Video",
    "language": "en"
  }'
```

## Database Verification

After a successful request, verify the data in your database:

### Check Concept Table
```sql
SELECT * FROM "Concept" ORDER BY "createdAt" DESC LIMIT 1;
```

### Check Content Table
```sql
SELECT * FROM "Content" 
WHERE "contentType" = 'YOUTUBE' 
ORDER BY "createdAt" DESC LIMIT 1;
```

Expected fields:
- `contentType`: 'YOUTUBE'
- `ytLink`: The videoId (e.g., 'dQw4w9WgXcQ')
- `path`: NULL

### Check UserConcept Table
```sql
SELECT uc.*, u.email, c."conceptId" 
FROM "UserConcept" uc
JOIN "User" u ON uc."userId" = u.id
JOIN "Concept" c ON uc."conceptId" = c.id
ORDER BY uc."createdAt" DESC LIMIT 1;
```

## Error Handling

### 401 Unauthorized
- Missing or invalid Bearer token
- User not found in database

### 400 Bad Request
- Missing `videoId` or `transcript` in request body

### 502 Bad Gateway
- Failed to generate summary (AI service error)

### 500 Internal Server Error
- Database connection issues
- Unexpected server errors

## Notes

- The concept extraction is non-critical - if it fails, the summary will still be returned
- User linking happens automatically after concept creation
- Duplicate user-concept links are handled gracefully (no error if already exists)
- The `ytLink` field stores just the videoId, not the full URL

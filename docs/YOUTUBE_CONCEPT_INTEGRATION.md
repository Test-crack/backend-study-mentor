# YouTube Study Notes - Concept Integration

## Overview
YouTube study material generation now automatically extracts and stores concepts using the UKB (Universal Knowledge Base) service.

## Flow

1. **Extract Transcript** (`POST /api/yt-study/extract`)
   - Fetches YouTube video transcript
   - Returns transcript segments

2. **Generate Study Material** (`POST /api/yt-study/summarize`)
   - Generates study notes from transcript
   - **NEW**: Extracts concepts using Gemini AI
   - **NEW**: Stores concept + content in database
   - Returns markdown study material + concept info

## Database Schema

### Content Table (NEW)
```prisma
model Content {
  id          String      @id @default(uuid)
  conceptId   String      @unique
  contentType ContentType // YOUTUBE, NOTES, PDF, TEXT
  title       String?     // Video title
  ytLink      String?     // YouTube URL
  path        String?     // VideoId for retrieval
  createdAt   DateTime
  updatedAt   DateTime
  Concept     Concept     @relation(...)
}
```

### Concept Table (Updated)
- Added 1-1 relation with Content table

## API Changes

### POST /api/yt-study/summarize

**Request Body:**
```json
{
  "videoId": "abc123",
  "transcript": [...],
  "language": "en",
  "title": "Introduction to Physics",  // NEW (optional)
  "url": "https://youtube.com/watch?v=abc123"  // NEW (optional)
}
```

**Response:**
```json
{
  "status": 200,
  "videoId": "abc123",
  "markdown": "# Study Notes...",
  "concept": {  // NEW
    "conceptId": "PHYSICS.MECHANICS.001",
    "domain": "physics",
    "keywords": ["force", "motion", "energy"],
    "learningObjective": "Students will be able to..."
  },
  "message": "Study material generated successfully."
}
```

## Services

### conceptService.ts
- Analyzes content using Gemini AI
- Extracts domain, concept, keywords, learning objectives
- Returns structured concept data

### conceptDbService.ts
- Handles database operations
- Creates concept with auto-incrementing sequence
- Links content to concept (1-1 relationship)

## Migration

Run the migration SQL manually on your database:
```bash
psql -h <host> -U <user> -d study_mentor_db -f prisma/migrations/add_content_table.sql
```

Or use Prisma migrate when you have DB access:
```bash
npx prisma migrate dev --name add_content_table
```

## Environment Variables Required

- `GEMINI_API_KEY` - For concept extraction
- `OPENROUTER_API_KEY` - For study material generation

## Error Handling

- Concept extraction is non-critical
- If concept extraction fails, study material generation continues
- Errors are logged but don't break the main flow

# YouTube Study Material Caching System

## Overview
Implements a robust file system caching mechanism for YouTube study materials to reduce LLM API costs and improve response times. When a video is processed once, subsequent requests serve cached content instantly.

## Architecture

### Flow Diagram
```
Request → Step 0: Check Cache → Cache Hit? 
                                    ↓ Yes: Load from file + Link user
                                    ↓ No: Continue to Step 1
                                    
Step 1: Generate with LLM → Step 2: Save to DB → Step 2.5: Cache to file → Step 3: Link user
```

### Components

#### 1. File Storage Service (`src/services/fileStorageService.ts`)
Handles all file system operations for caching study materials.

**Key Functions:**
- `initializeStorage()` - Creates necessary directories on server startup
- `saveStudyMaterial(videoId, markdown)` - Saves markdown to file system
- `loadStudyMaterial(relativePath)` - Loads markdown from file system
- `studyMaterialExists(relativePath)` - Checks if cached file exists
- `getFilePath(videoId)` - Returns absolute path (cross-platform)
- `getRelativePath(videoId)` - Returns relative path for database storage

**File Structure:**
```
project-root/
└── uploads/
    └── YOUTUBE_NOTES/
        ├── abc123.md
        ├── xyz789.md
        └── ...
```

**Filename Format:** `{videoId}.md`
- Example: `dQw4w9WgXcQ.md`
- Sanitized to ensure filesystem safety

#### 2. Content Cache Service (`src/services/contentCacheService.ts`)
Handles database operations for checking and retrieving cached content.

**Key Functions:**
- `getCachedYouTubeContent(videoId)` - Checks if content exists in DB with valid path
- `updateContentPath(contentId, path)` - Updates content path after file save

**Cache Hit Criteria:**
- Content exists in database
- `ytLink` matches videoId
- `contentType` is YOUTUBE
- `path` is NOT null
- Associated concept exists

#### 3. Updated Controller (`src/controllers/ytStudyController.ts`)
Implements the caching logic in the study material generation flow.

## Request Flow

### Cache Hit (Fast Path)
1. **Check Database**: Query for existing content by videoId
2. **Verify File**: Confirm cached file exists on disk
3. **Load Content**: Read markdown from file system
4. **Link User**: Create user-concept relationship
5. **Return**: Send cached content to client

**Performance:**
- No LLM API calls
- 1 database read
- 1 file read
- 1 database write (user link)
- Response time: ~50-100ms

### Cache Miss (Full Path)
1. **Generate**: Call LLM to create study material + extract metadata
2. **Save to DB**: Create concept and content records
3. **Cache to File**: Save markdown to file system
4. **Update Path**: Store file path in database
5. **Link User**: Create user-concept relationship
6. **Return**: Send generated content to client

**Performance:**
- 1 LLM API call
- 2-3 database writes
- 1 file write
- Response time: ~5-10 seconds (depending on LLM)

## Database Schema

### Content Table
```typescript
{
  id: string
  conceptId: string
  contentType: ContentType (YOUTUBE)
  title: string
  ytLink: string          // YouTube video ID
  path: string | null     // Relative path to cached file
  createdAt: DateTime
  updatedAt: DateTime
}
```

**Path Format:** `uploads/YOUTUBE_NOTES/{videoId}.md`
- Stored with forward slashes (cross-platform compatible)
- Relative to project root

## API Response

### Response Structure
```json
{
  "status": 200,
  "videoId": "abc123",
  "markdown": "# Study Material...",
  "concept": {
    "conceptId": "SCIENCE.PHYSICS.001",
    "domain": "science",
    "conceptSlug": "physics",
    "keywords": ["energy", "motion", "force"],
    "learningObjective": "Students will be able to...",
    "userLinked": true
  },
  "message": "Study material loaded from cache.",
  "cached": true  // true if from cache, false if newly generated
}
```

## Error Handling

### Graceful Degradation
The system is designed to handle failures gracefully:

1. **Cache Check Fails**: Falls back to generation
2. **File Load Fails**: Regenerates content
3. **File Save Fails**: Continues without caching (non-critical)
4. **Path Update Fails**: Logs error but returns content

### Production Considerations

#### File System
- Directories created automatically on startup
- Cross-platform path handling (Windows, Linux, macOS)
- Proper error handling for disk full scenarios
- File permissions handled by Node.js

#### Database
- Transactional operations for data consistency
- Duplicate key handling for user-concept links
- Proper indexing on `ytLink` and `path` fields

#### Monitoring
- Comprehensive logging at each step
- Cache hit/miss tracking
- Error logging with context

## Benefits

### Cost Savings
- **First Request**: Full LLM cost (~$0.01-0.05 per video)
- **Subsequent Requests**: $0 (cached)
- **ROI**: Breaks even after 1 duplicate request

### Performance Improvement
- **First Request**: 5-10 seconds
- **Cached Request**: 50-100ms (100x faster)

### Scalability
- File system caching reduces database load
- No LLM rate limiting issues for cached content
- Horizontal scaling possible with shared file storage (NFS, S3)

## Maintenance

### Cache Invalidation
Currently, cache is permanent. Future enhancements could include:
- TTL (time-to-live) for cached content
- Manual cache invalidation endpoint
- Automatic regeneration on content updates

### Storage Management
- Monitor disk usage in `uploads/YOUTUBE_NOTES/`
- Implement cleanup for old/unused content
- Consider compression for large files

### Backup Strategy
- Include `uploads/` in backup procedures
- Database contains path references
- Can regenerate if files lost (but costs LLM calls)

## Testing

### Test Cache Hit
```bash
# First request (cache miss)
POST /api/yt-study/summarize
{
  "videoId": "test123",
  "transcript": [...],
  "title": "Test Video"
}
# Response: cached: false

# Second request (cache hit)
POST /api/yt-study/summarize
{
  "videoId": "test123",
  "transcript": [...],
  "title": "Test Video"
}
# Response: cached: true
```

### Verify File Creation
```bash
# Check if file exists
ls uploads/YOUTUBE_NOTES/test123.md

# View content
cat uploads/YOUTUBE_NOTES/test123.md
```

## Future Enhancements

1. **CDN Integration**: Serve cached files via CDN for global distribution
2. **Compression**: Gzip markdown files to save disk space
3. **Versioning**: Support multiple versions of study materials
4. **Analytics**: Track cache hit rates and cost savings
5. **Cleanup Jobs**: Automated removal of unused cached content
6. **S3 Storage**: Move to cloud storage for production scalability

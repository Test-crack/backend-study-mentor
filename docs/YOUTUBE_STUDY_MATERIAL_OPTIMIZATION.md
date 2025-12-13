# YouTube Study Material Generation - Optimization

## Overview
Optimized the YouTube study material generation flow to use a single LLM call instead of two, reducing cost and latency by ~50%.

## Changes Made

### 1. Combined LLM Operations
**Before:** 
- Call 1: Generate markdown study material
- Call 2: Extract concept metadata from the markdown

**After:**
- Single call: Generate markdown + extract concept metadata simultaneously

### 2. Enhanced Function: `generateYouTubeStudyMaterial()`
Renamed from `summarizeTranscript()` (old name still works for backward compatibility)

**Returns:**
```typescript
{
  success: true,
  markdown: string,  // Study material in markdown format
  conceptMetadata: {
    domain: string,              // e.g., "science", "engineering"
    conceptSlug: string,         // e.g., "hybrid-power-systems"
    keywords: string[],          // General keywords (5-8)
    learningObjective: string,   // "Students will be able to..."
    baseConceptId: string        // e.g., "SCIENCE.HYBRID-POWER-SYSTEMS"
  }
}
```

### 3. Concept Metadata Extraction
Extracts key metadata from the content in a single LLM call:

- **domain**: High-level subject area
- **conceptSlug**: Short identifier for the main concept
- **keywords**: 5-8 relevant keywords from the content
- **learningObjective**: Educational goal statement
- **baseConceptId**: Unique identifier for the concept

### 4. API Response Structure
**Endpoint:** `POST /api/yt-study/summarize`

**Response:**
```json
{
  "status": 200,
  "videoId": "abc123",
  "markdown": "# Study Material...",
  "concept": {
    "conceptId": "SCIENCE.HYBRID-POWER-SYSTEMS.001",
    "domain": "science",
    "conceptSlug": "hybrid-power-systems",
    "keywords": ["hybrid", "power", "electric", "combustion", "MGUK", "regulations"],
    "learningObjective": "Students will be able to...",
    "userLinked": true
  },
  "message": "Study material generated successfully."
}
```

## Benefits

1. **Cost Reduction**: ~50% reduction in LLM API costs (1 call instead of 2)
2. **Latency Improvement**: ~50% faster response time
3. **Better Consistency**: Concept metadata extracted from same context as study material
4. **Simplified Flow**: Cleaner code with single LLM interaction
5. **Better Data Structure**: All concept metadata available in one response

## Migration Notes

- Old function name `summarizeTranscript()` still works (aliased to new function)
- No breaking changes to existing API contracts
- Keywords can be used by frontend for search, tagging, or highlighting features

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
    baseConceptId: string,       // e.g., "SCIENCE.HYBRID-POWER-SYSTEMS"
    importantKeywords: string[], // Terms to highlight in YELLOW (3-5)
    criticalKeywords: string[]   // Terms to highlight in RED/ORANGE (2-3)
  }
}
```

### 3. Keyword Highlighting Feature
Added support for highlighting important terms in the study material:

- **importantKeywords**: Terms that are IMPORTANT for understanding (highlight in yellow)
- **criticalKeywords**: Terms that are CRITICAL/ESSENTIAL (highlight in orange/red)

Frontend should apply these highlights when rendering the markdown.

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
    "keywords": ["hybrid", "power", "electric", "combustion"],
    "learningObjective": "Students will be able to...",
    "importantKeywords": ["MGUK", "50/50 split", "power unit"],
    "criticalKeywords": ["hybrid power", "2026 regulations"],
    "userLinked": true
  },
  "message": "Study material generated successfully."
}
```

## Frontend Integration

### Rendering Highlighted Keywords
When displaying the markdown, apply highlights:

```javascript
// Pseudo-code for highlighting
function highlightKeywords(markdown, importantKeywords, criticalKeywords) {
  let highlighted = markdown;
  
  // Highlight critical keywords (red/orange)
  criticalKeywords.forEach(keyword => {
    highlighted = highlighted.replace(
      new RegExp(`\\b${keyword}\\b`, 'gi'),
      `<mark class="critical">$&</mark>`
    );
  });
  
  // Highlight important keywords (yellow)
  importantKeywords.forEach(keyword => {
    highlighted = highlighted.replace(
      new RegExp(`\\b${keyword}\\b`, 'gi'),
      `<mark class="important">$&</mark>`
    );
  });
  
  return highlighted;
}
```

### CSS Styling
```css
mark.important {
  background-color: #fff3cd; /* Yellow */
  padding: 2px 4px;
  border-radius: 2px;
}

mark.critical {
  background-color: #f8d7da; /* Light red/orange */
  padding: 2px 4px;
  border-radius: 2px;
  font-weight: 600;
}
```

## Benefits

1. **Cost Reduction**: ~50% reduction in LLM API costs (1 call instead of 2)
2. **Latency Improvement**: ~50% faster response time
3. **Better Consistency**: Concept metadata extracted from same context as study material
4. **Enhanced UX**: Keyword highlighting helps students identify key terms
5. **Simplified Flow**: Cleaner code with single LLM interaction

## Migration Notes

- Old function name `summarizeTranscript()` still works (aliased to new function)
- No breaking changes to existing API contracts
- Frontend needs update to support keyword highlighting (optional enhancement)

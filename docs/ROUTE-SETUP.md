# Route Setup for Client-Assisted Transcript

## Add to your routes file

If you have a routes file like `src/routes/youtubeRoutes.ts` or similar, add this endpoint:

```typescript
import { Router } from 'express';
import { extractTranscript, generateStudyMaterial, submitClientTranscript } from '../controllers/ytStudyController';
import { authenticate } from '../middleware/auth';

const router = Router();

// Existing routes
router.post('/transcript', extractTranscript);
router.post('/study-material', authenticate, generateStudyMaterial);

// NEW: Client-assisted transcript submission
router.post('/transcript/client-submit', submitClientTranscript);

export default router;
```

## Client-Side Implementation Example

### React/TypeScript Example

```typescript
// services/transcriptService.ts
interface TranscriptSegment {
  text: string;
  offset?: number;
  duration?: number;
}

interface TranscriptResponse {
  status: number;
  videoId: string;
  transcript: TranscriptSegment[];
  method: string;
  message: string;
}

interface ClientFallbackResponse {
  error: string;
  code: 'CLIENT_FALLBACK_REQUIRED';
  videoId: string;
  message: string;
}

/**
 * Fetch transcript from server
 */
export async function fetchTranscript(url: string): Promise<TranscriptResponse> {
  const response = await fetch('/api/youtube/transcript', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  });

  if (response.status === 206) {
    // Server needs client assistance
    const data: ClientFallbackResponse = await response.json();
    console.log('Server requested client assistance:', data);
    
    // Fetch transcript on client-side
    const clientTranscript = await fetchTranscriptOnClient(data.videoId);
    
    // Submit back to server
    return await submitClientTranscript(data.videoId, clientTranscript);
  }

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch transcript');
  }

  return await response.json();
}

/**
 * Fetch transcript using client-side library
 * Example using youtube-transcript library
 */
async function fetchTranscriptOnClient(videoId: string): Promise<TranscriptSegment[]> {
  try {
    // Option 1: Use youtube-transcript library (if available in browser)
    // const { YoutubeTranscript } = await import('youtube-transcript');
    // const transcript = await YoutubeTranscript.fetchTranscript(videoId);
    
    // Option 2: Use a browser extension or iframe approach
    // This is a placeholder - implement based on your needs
    console.log('Fetching transcript on client for:', videoId);
    
    // For now, throw error - you need to implement actual client-side fetching
    throw new Error('Client-side transcript fetching not implemented');
    
  } catch (error) {
    console.error('Client-side transcript fetch failed:', error);
    throw error;
  }
}

/**
 * Submit client-fetched transcript to server
 */
async function submitClientTranscript(
  videoId: string, 
  transcript: TranscriptSegment[]
): Promise<TranscriptResponse> {
  const response = await fetch('/api/youtube/transcript/client-submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videoId, transcript })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to submit transcript');
  }

  return await response.json();
}
```

### Usage in Component

```typescript
// components/TranscriptFetcher.tsx
import { useState } from 'react';
import { fetchTranscript } from '../services/transcriptService';

export function TranscriptFetcher() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [transcript, setTranscript] = useState(null);
  const [error, setError] = useState('');

  const handleFetch = async () => {
    setLoading(true);
    setError('');
    
    try {
      const result = await fetchTranscript(url);
      setTranscript(result.transcript);
      console.log('Fetched using:', result.method);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <input 
        value={url} 
        onChange={(e) => setUrl(e.target.value)}
        placeholder="YouTube URL"
      />
      <button onClick={handleFetch} disabled={loading}>
        {loading ? 'Fetching...' : 'Get Transcript'}
      </button>
      
      {error && <div className="error">{error}</div>}
      
      {transcript && (
        <div className="transcript">
          {transcript.map((seg, i) => (
            <p key={i}>{seg.text}</p>
          ))}
        </div>
      )}
    </div>
  );
}
```

## Testing

### Test Server Methods
```bash
curl -X POST http://localhost:3000/api/youtube/transcript \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'
```

### Test Client Submit
```bash
curl -X POST http://localhost:3000/api/youtube/transcript/client-submit \
  -H "Content-Type: application/json" \
  -d '{
    "videoId": "dQw4w9WgXcQ",
    "transcript": [
      {"text": "Hello world", "offset": 0, "duration": 2.5}
    ]
  }'
```

## Notes

- The client-side transcript fetching implementation depends on your frontend setup
- You may need to use a browser extension or iframe approach for actual client-side fetching
- The server will cache any client-submitted transcripts for future requests
- Status code 206 (Partial Content) indicates client assistance is needed

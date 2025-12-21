import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface Caption {
  caption: string;
  startTime: number;
  endTime: number;
}

interface TranscriptSegment {
  text: string;
  offset?: number;
  duration?: number;
}

/**
 * Method 0: Database cache lookup (fastest)
 * Checks if transcript is already cached in database
 */
export async function fetchTranscriptMethod0(videoId: string): Promise<Caption[]> {
  console.log(`[Method 0] Checking cache for videoId: ${videoId}`);
  
  try {
    const cached = await prisma.youTubeTranscript.findUnique({
      where: { videoId }
    });
    
    if (!cached) {
      console.log(`[Method 0] No cache found for videoId: ${videoId}`);
      throw new Error("Not found in cache");
    }
    
    // Update access count and last accessed time
    await prisma.youTubeTranscript.update({
      where: { videoId },
      data: {
        accessCount: { increment: 1 },
        lastAccessed: new Date()
      }
    });
    
    console.log(`[Method 0] ✅ Cache hit! Returning ${(cached.transcript as any[]).length} cached segments`);
    console.log(`[Method 0] Originally fetched using: ${cached.method || 'unknown'}`);
    console.log(`[Method 0] Access count: ${cached.accessCount + 1}`);
    
    // Convert cached JSON back to Caption format
    const transcript = cached.transcript as any[];
    return transcript.map(seg => ({
      caption: seg.text,
      startTime: seg.offset || 0,
      endTime: (seg.offset || 0) + (seg.duration || 0)
    }));
    
  } catch (error: any) {
    console.log(`[Method 0] ❌ Cache miss: ${error.message}`);
    throw error;
  }
}

/**
 * Save transcript to database cache
 */
export async function saveTranscriptToCache(
  videoId: string, 
  transcript: TranscriptSegment[], 
  method: string,
  title?: string
): Promise<void> {
  try {
    console.log(`[Cache] Saving transcript for videoId: ${videoId} (${transcript.length} segments)`);
    
    // Calculate total duration
    const duration = transcript.length > 0 
      ? Math.max(...transcript.map(s => (s.offset || 0) + (s.duration || 0)))
      : 0;
    
    await prisma.youTubeTranscript.upsert({
      where: { videoId },
      create: {
        videoId,
        title,
        transcript: transcript as any,
        method,
        duration: Math.round(duration),
        accessCount: 1
      },
      update: {
        transcript: transcript as any,
        method,
        duration: Math.round(duration),
        title: title || undefined,
        updatedAt: new Date()
      }
    });
    
    console.log(`[Cache] ✅ Transcript cached successfully`);
  } catch (error: any) {
    console.error(`[Cache] ❌ Failed to save to cache:`, error.message);
    // Don't throw - caching failure shouldn't break the main flow
  }
}

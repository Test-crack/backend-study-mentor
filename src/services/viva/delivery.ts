// Deterministic delivery metrics from ASR word timings (fluency signal).
// v1: computed + stored as evidence / for calibration (the competence grader still
// makes the fluency call from audio). v1.1: map these directly to a fluency level.
import { DeliveryMetrics } from './types';

export function computeDelivery(
  words: Array<{ word: string; startMs: number; endMs: number; confidence?: number }>
): DeliveryMetrics {
  if (!words.length) return { wordCount: 0, wpm: 0, pauseRatio: 0, meanPauseMs: 0 };
  const wordCount = words.length;
  const start = words[0].startMs;
  const end = words[words.length - 1].endMs;
  const spanMs = Math.max(1, end - start);

  let pauseTotal = 0, pauseCount = 0;
  for (let i = 1; i < words.length; i++) {
    const gap = words[i].startMs - words[i - 1].endMs;
    if (gap > 0) { pauseTotal += gap; pauseCount++; }
  }

  return {
    wordCount,
    wpm: Math.round(wordCount / (spanMs / 60000)),
    pauseRatio: Number((pauseTotal / spanMs).toFixed(3)),
    meanPauseMs: pauseCount ? Math.round(pauseTotal / pauseCount) : 0,
  };
}

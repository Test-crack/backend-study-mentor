/**
 * Deterministic pseudo-random number seeded by a string.
 * Same seed → same number every time. Used for reproducible generation.
 *
 * Uses FNV-1a hashing + an xorshift avalanche mix so that seeds differing by only
 * one character (e.g. consecutive date strings "...-06-19" vs "...-06-20") still
 * produce well-spread, uncorrelated outputs. The previous simple hash did NOT
 * avalanche — near-identical seeds gave near-identical values, which made the
 * daily activity roll effectively constant per student across days.
 */
export function seededRand(seed: string, min: number, max: number): number {
  let h = 2166136261 >>> 0; // FNV offset basis
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619); // FNV prime
  }
  // Final avalanche (MurmurHash3-style) so all input bits affect all output bits
  h ^= h >>> 15; h = Math.imul(h, 2246822507);
  h ^= h >>> 13; h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  const normalised = (h >>> 0) / 4294967296; // [0, 1)
  return min + normalised * (max - min);
}

/**
 * Round a band score to the nearest 0.5, clamped between 0.0 and 9.0.
 */
export function roundBand(value: number): number {
  return Math.min(9.0, Math.max(0.0, Math.round(value * 2) / 2));
}

/**
 * Add ± noise to a band score and round it.
 */
export function noisyBand(base: number, noiseSeed: string, noiseAmount = 0.5): number {
  const noise = seededRand(noiseSeed, -noiseAmount, noiseAmount);
  return roundBand(base + noise);
}

/**
 * Derive a date that is `daysAgo` days before today, at midnight UTC.
 */
export function daysAgo(days: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

/** Today at midnight UTC — used for "drilled today" sessions. */
export function today(): Date {
  return daysAgo(0);
}

/**
 * Yesterday at midnight UTC — used for last_streak_date. The app only CONTINUES a
 * streak when last_streak_date == yesterday; if it were today, the next real drill
 * would reset the streak to 1. So we seed yesterday and let today's activity bump it.
 */
export function yesterday(): Date {
  return daysAgo(1);
}

/**
 * Human-readable "host:port/dbname" from DATABASE_URL (no credentials).
 * Printed at startup so you can confirm WHICH database you're about to write to.
 */
export function dbHostLabel(): string {
  const url = process.env.DATABASE_URL || '';
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}`;
  } catch {
    return '(DATABASE_URL not set or unparseable)';
  }
}

/**
 * Fake deterministic supabase UUID derived from an email.
 * Stored as-is in supabaseuserid (varchar 255). Not a real Supabase UUID —
 * only used for seeded demo accounts so auth is bypassed entirely.
 */
export function fakeSupabaseId(email: string): string {
  return `seed-${email}`;
}

/** Feedback lookup table by band tier */
export const FEEDBACK_BY_TIER: Record<'low' | 'mid' | 'high', string[]> = {
  low: [
    'Significant improvement needed across all areas.',
    'Basic understanding present but lacks accuracy and depth.',
    'Frequent errors in grammar and vocabulary usage.',
    'Needs focused practice on foundational skills.',
    'Struggles to sustain coherent responses under time pressure.',
  ],
  mid: [
    'Developing competence; consistent practice will yield results.',
    'Some errors present but meaning is generally clear.',
    'Good attempt; vocabulary range is adequate but limited.',
    'Demonstrates understanding of core concepts with minor gaps.',
    'Logical structure evident; transitions could be smoother.',
  ],
  high: [
    'Strong performance across all assessment areas.',
    'Demonstrates clear command of language with minimal errors.',
    'Excellent task response; ideas well-developed and supported.',
    'Sophisticated vocabulary and grammatical range displayed.',
    'Near-band performance; continue refining for consistency.',
  ],
};

export function feedbackTier(band: number): 'low' | 'mid' | 'high' {
  if (band < 4.5) return 'low';
  if (band < 6.0) return 'mid';
  return 'high';
}

export function pickFeedback(band: number, seed: string): string {
  const tier = feedbackTier(band);
  const list = FEEDBACK_BY_TIER[tier];
  const idx = Math.floor(seededRand(seed, 0, list.length));
  return list[Math.min(idx, list.length - 1)];
}

/**
 * Structured WRITING feedback — matches the production shape produced by
 * analyzeWriting() in src/services/ieltsWritingService.ts. The Student Deep-Dive
 * frontend may index into feedback.<criterion>.next_step / feedback.priority_action,
 * so static strings would render blank. Shape:
 *   { task_response|coherence: {score_rationale, observed_issues[], next_step},
 *     vocabulary|grammar:      {score_rationale, error_examples[], next_step},
 *     priority_action }
 */
export function writingFeedback(band: number, email: string): Record<string, unknown> {
  const t = (k: string) => pickFeedback(band, `${k}-${email}`);
  return {
    task_response: { score_rationale: t('wtr'), observed_issues: [t('wtri')], next_step: t('wtrn') },
    coherence:     { score_rationale: t('wco'), observed_issues: [t('wcoi')], next_step: t('wcon') },
    vocabulary:    { score_rationale: t('wvo'), error_examples: [t('wvoe')], next_step: t('wvon') },
    grammar:       { score_rationale: t('wgr'), error_examples: [t('wgre')], next_step: t('wgrn') },
    priority_action: t('wpa'),
  };
}

/**
 * Structured SPEAKING feedback — matches the production shape produced by
 * analyzeSpeaking() in src/services/ieltsSpeakingService.ts. Shape:
 *   { fluency|vocabulary|pronunciation: {score_rationale, observed_issues[], next_step},
 *     grammar:                          {score_rationale, error_examples[],  next_step},
 *     filler_words_detected[], priority_action }
 */
export function speakingFeedback(band: number, email: string): Record<string, unknown> {
  const t = (k: string) => pickFeedback(band, `${k}-${email}`);
  return {
    fluency:       { score_rationale: t('sfl'), observed_issues: [t('sfli')], next_step: t('sfln') },
    vocabulary:    { score_rationale: t('svo'), observed_issues: [t('svoi')], next_step: t('svon') },
    grammar:       { score_rationale: t('sgr'), error_examples: [t('sgre')],  next_step: t('sgrn') },
    pronunciation: { score_rationale: t('spr'), observed_issues: [t('spri')], next_step: t('sprn') },
    filler_words_detected: band < 5 ? ['um — 4 times', 'like — 3 times'] : ['um — 1 time'],
    priority_action: t('spa'),
  };
}

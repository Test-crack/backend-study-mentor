export type PersonaGroup = 'HIGH' | 'MID' | 'LOW' | 'EDGE';

export interface SkillBand {
  LISTENING: number;
  READING: number;
  WRITING: number;
  SPEAKING: number;
}

export interface Persona {
  name: string;
  email: string;
  password: string;
  group: PersonaGroup;
  diagnosticBand: SkillBand;
  targetBandOffset: number; // added to max diagnostic band to get target_band
  accuracyRate: number;     // 0–1, base accuracy for drills/IA
  skillAccuracy?: Partial<SkillBand>; // per-skill accuracy override (0–1) — for asymmetric personas
  drillCount: number;       // number of drill sessions to seed
  iaCount: number;          // completed IA sessions (Kiran gets special treatment)
  momentumBase: number;     // base momentum awarded per IA session (stored on the IASession row)
  momentumScore: number;    // final institute_students.momentum_score (accumulated; <100 => at-risk threshold)
  dailyStreak: number;      // institute_students.daily_streak (>0 => active, no "streak broken" flag)
  atRisk: boolean;          // should appear in the instructor at-risk list (drives stale activity + low momentum)
  activityRate?: number;    // OPTIONAL override (0–1): daily chance dailyTick.ts makes this student active.
                            //   If unset, dailyTick derives it: at-risk/dropout = 0, erratic = 0.5, HIGH = 0.95, MID = 0.65, else 0.8.
  isDropout: boolean;
  isErratic: boolean;
}

export const SEED_EMAIL_DOMAIN = '@seed.testcrack.dev';

// At-risk threshold reference (instructorProgressController.ts):
//   momentum_score < 100            -> "Low momentum"
//   daysInactive >= 3               -> "No activity for N days"
//   daily_streak === 0 && inactive  -> "Streak broken"
// Non-at-risk personas get momentum >= 100, daily_streak > 0, and a drill dated today.
// At-risk personas get momentum < 100, daily_streak 0, and stale (>=3 day old) drills.

export const PERSONAS: Persona[] = [
  // ─── Group A: High Performers ───────────────────────────────────────────────
  {
    name: 'Arjun Menon',
    email: `arjun.menon${SEED_EMAIL_DOMAIN}`,
    password: 'Seed@1234',
    group: 'HIGH',
    diagnosticBand: { LISTENING: 7.0, READING: 6.5, WRITING: 6.0, SPEAKING: 6.0 },
    targetBandOffset: 1.0,
    accuracyRate: 0.91,
    drillCount: 9,
    iaCount: 2,
    momentumBase: 18,
    momentumScore: 185,
    dailyStreak: 9, // == drillCount: drills land on this many consecutive days ending today
    atRisk: false,
    isDropout: false,
    isErratic: false,
  },
  {
    name: 'Divya Krishnan',
    email: `divya.krishnan${SEED_EMAIL_DOMAIN}`,
    password: 'Seed@1234',
    group: 'HIGH',
    diagnosticBand: { LISTENING: 7.0, READING: 7.0, WRITING: 6.5, SPEAKING: 6.5 },
    targetBandOffset: 1.0,
    accuracyRate: 0.93,
    drillCount: 10,
    iaCount: 2,
    momentumBase: 19,
    momentumScore: 215,
    dailyStreak: 10, // == drillCount
    atRisk: false,
    isDropout: false,
    isErratic: false,
  },
  {
    name: 'Rohan Thomas',
    email: `rohan.thomas${SEED_EMAIL_DOMAIN}`,
    password: 'Seed@1234',
    group: 'HIGH',
    diagnosticBand: { LISTENING: 6.5, READING: 6.0, WRITING: 6.0, SPEAKING: 6.0 },
    targetBandOffset: 1.0,
    accuracyRate: 0.85,
    drillCount: 8,
    iaCount: 2,
    momentumBase: 16,
    momentumScore: 145,
    dailyStreak: 8, // == drillCount
    atRisk: false,
    isDropout: false,
    isErratic: false,
  },

  // ─── Group B: Developing ────────────────────────────────────────────────────
  {
    name: 'Meena Pillai',
    email: `meena.pillai${SEED_EMAIL_DOMAIN}`,
    password: 'Seed@1234',
    group: 'MID',
    diagnosticBand: { LISTENING: 5.5, READING: 5.0, WRITING: 5.0, SPEAKING: 4.5 },
    targetBandOffset: 1.0,
    accuracyRate: 0.66,
    drillCount: 6,
    iaCount: 1,
    momentumBase: 10,
    momentumScore: 120,
    dailyStreak: 6, // == drillCount
    atRisk: false,
    isDropout: false,
    isErratic: false,
  },
  {
    name: 'Arun Nair',
    email: `arun.nair${SEED_EMAIL_DOMAIN}`,
    password: 'Seed@1234',
    group: 'MID',
    diagnosticBand: { LISTENING: 5.5, READING: 5.5, WRITING: 4.0, SPEAKING: 4.5 },
    targetBandOffset: 1.0,
    accuracyRate: 0.61,
    drillCount: 5,
    iaCount: 1,
    momentumBase: 9,
    momentumScore: 108,
    dailyStreak: 5, // == drillCount
    atRisk: false,
    isDropout: false,
    isErratic: false,
  },
  {
    name: 'Sneha George',
    email: `sneha.george${SEED_EMAIL_DOMAIN}`,
    password: 'Seed@1234',
    group: 'MID',
    diagnosticBand: { LISTENING: 5.0, READING: 5.0, WRITING: 5.0, SPEAKING: 5.0 },
    targetBandOffset: 1.0,
    accuracyRate: 0.64,
    drillCount: 6,
    iaCount: 1,
    momentumBase: 10,
    momentumScore: 115,
    dailyStreak: 6, // == drillCount
    atRisk: false,
    isDropout: false,
    isErratic: false,
  },

  // ─── Group C: Struggling (at-risk) ──────────────────────────────────────────
  {
    name: 'Rahul Shetty',
    email: `rahul.shetty${SEED_EMAIL_DOMAIN}`,
    password: 'Seed@1234',
    group: 'LOW',
    diagnosticBand: { LISTENING: 4.0, READING: 3.5, WRITING: 3.5, SPEAKING: 3.0 },
    targetBandOffset: 1.5,
    accuracyRate: 0.43,
    drillCount: 4,
    iaCount: 2, // 2 IAs, newer lower => "Band score declining" keeps them at-risk while active
    momentumBase: 4,
    momentumScore: 35,
    dailyStreak: 0,
    atRisk: true,
    isDropout: false,
    isErratic: false,
  },
  {
    name: 'Priya Babu',
    email: `priya.babu${SEED_EMAIL_DOMAIN}`,
    password: 'Seed@1234',
    group: 'LOW',
    diagnosticBand: { LISTENING: 4.0, READING: 4.0, WRITING: 3.0, SPEAKING: 3.0 },
    targetBandOffset: 1.5,
    accuracyRate: 0.46,
    drillCount: 3,
    iaCount: 2, // declining IAs => stays at-risk while active
    momentumBase: 5,
    momentumScore: 28,
    dailyStreak: 0,
    atRisk: true,
    isDropout: false,
    isErratic: false,
  },
  {
    name: 'Vishnu Kumar',
    email: `vishnu.kumar${SEED_EMAIL_DOMAIN}`,
    password: 'Seed@1234',
    group: 'LOW',
    diagnosticBand: { LISTENING: 3.5, READING: 3.5, WRITING: 3.5, SPEAKING: 3.5 },
    targetBandOffset: 1.5,
    accuracyRate: 0.38,
    drillCount: 3,
    iaCount: 2, // declining IAs => stays at-risk while active
    momentumBase: 3,
    momentumScore: 18,
    dailyStreak: 0,
    atRisk: true,
    isDropout: false,
    isErratic: false,
  },

  // ─── Group D: Edge Cases ────────────────────────────────────────────────────
  {
    name: 'Anjali Suresh',
    email: `anjali.suresh${SEED_EMAIL_DOMAIN}`,
    password: 'Seed@1234',
    group: 'EDGE',
    diagnosticBand: { LISTENING: 6.0, READING: 6.0, WRITING: 3.5, SPEAKING: 3.5 },
    targetBandOffset: 1.0,
    accuracyRate: 0.55, // unused for her — skillAccuracy drives generation
    // Skill asymmetry: strong L/R, weak W/S. Drives both drill accuracy and L/R diagnostic accuracy.
    skillAccuracy: { LISTENING: 0.78, READING: 0.75, WRITING: 0.35, SPEAKING: 0.35 },
    drillCount: 5,
    iaCount: 1,
    momentumBase: 8,
    momentumScore: 130,
    dailyStreak: 5, // == drillCount
    atRisk: false,
    isDropout: false,
    isErratic: false,
  },
  {
    name: 'Kiran Das',
    email: `kiran.das${SEED_EMAIL_DOMAIN}`,
    password: 'Seed@1234',
    group: 'EDGE',
    diagnosticBand: { LISTENING: 5.0, READING: 5.0, WRITING: 5.0, SPEAKING: 5.0 },
    targetBandOffset: 1.0,
    accuracyRate: 0.45, // declining — completed drills run 0.52 -> 0.38
    drillCount: 5,      // 3 declining-completed + 2 abandoned (correct_answers = 0)
    iaCount: 1,         // 1 COMPLETED + 1 IN_PROGRESS (special cased in seedIASessions)
    momentumBase: 8,
    momentumScore: 40,
    dailyStreak: 0,
    atRisk: true,       // dropout signal -> appears in at-risk list
    isDropout: true,
    isErratic: false,
  },
  {
    name: 'Lena Joseph',
    email: `lena.joseph${SEED_EMAIL_DOMAIN}`,
    password: 'Seed@1234',
    group: 'EDGE',
    // Erratic: diagnostic band alternates 6.5 / 4.5 across skills so the
    // StudentCompetencyMatrix averaging logic is exercised on an oscillating series.
    diagnosticBand: { LISTENING: 6.5, READING: 4.5, WRITING: 6.5, SPEAKING: 4.5 },
    targetBandOffset: 1.0,
    accuracyRate: 0.62, // base; drill accuracy oscillates via isErratic
    drillCount: 6,
    iaCount: 2,
    momentumBase: 10,
    momentumScore: 112,
    dailyStreak: 6, // == drillCount
    atRisk: false,
    isDropout: false,
    isErratic: true,
  },
];

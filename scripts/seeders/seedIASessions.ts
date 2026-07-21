/**
 * TC-05: Seed IASession records for all 12 personas.
 *
 * Kiran Das special case:
 *   - ia_number 1: COMPLETED
 *   - ia_number 2: IN_PROGRESS (abandoned — no scores JSONB)
 *
 * IASession unique constraint: [student_id, ia_date] — each IA uses a different date.
 *
 * NOTE: `window_closes_at` is required (non-nullable). We set it to 24h after ia_date.
 */

import prisma from '../../src/lib/prisma';
import { PERSONAS, type Persona } from './personas';
import { noisyBand, seededRand, daysAgo } from './utils';
import type { StudentRecord } from './createStudents';

// Skills and sub-skills we include in IA scores (2–3 per session)
const IA_SUBSKILL_SETS = [
  [
    { skill: 'WRITING', sub_skill: 'GRAMMAR' },
    { skill: 'WRITING', sub_skill: 'VOCABULARY' },
    { skill: 'WRITING', sub_skill: 'COHERENCE' },
  ],
  [
    { skill: 'LISTENING', sub_skill: 'LISTENING' },
    { skill: 'READING', sub_skill: 'READING' },
  ],
  [
    { skill: 'SPEAKING', sub_skill: 'FLUENCY' },
    { skill: 'SPEAKING', sub_skill: 'PRONUNCIATION' },
  ],
];

function personaMeanBand(persona: Persona): number {
  const b = persona.diagnosticBand;
  return (b.LISTENING + b.READING + b.WRITING + b.SPEAKING) / 4;
}

function buildIAScores(persona: Persona, index: number, count: number): object[] {
  const set = IA_SUBSKILL_SETS[index % IA_SUBSKILL_SETS.length];
  // index 0 = oldest IA, index count-1 = newest.
  //  - Group C strugglers (atRisk, not dropout): the NEWEST IA drops ~1.5 bands
  //    (recent slip), earlier ones sit at their mean → fires "Band score declining"
  //    so they stay at-risk while still actively trying.
  //  - Everyone else: gentle upward drift so the newest is never below the previous
  //    (no false declining flag).
  const mean = personaMeanBand(persona);
  const declining = persona.atRisk && !persona.isDropout;
  const isNewest = index === count - 1;
  const base = declining
    ? (isNewest && count > 1 ? mean - 1.5 : mean)
    : mean + index * 0.4;
  return set.map((entry) => {
    const band = noisyBand(base, `ia-${entry.sub_skill}-${persona.email}-${index}`, 0.3);
    const total = 4;
    const correct = Math.round(persona.accuracyRate * total);
    return {
      skill: entry.skill,
      sub_skill: entry.sub_skill,
      band,
      correct,
      total,
      ai_graded: true,
      ai_feedback: {
        rationale: `Student shows ${band >= 6 ? 'good' : band >= 4.5 ? 'developing' : 'limited'} competency in ${entry.sub_skill.toLowerCase()}.`,
        key_observations: [
          band < 5 ? 'Significant errors present' : 'Mostly accurate responses',
          band < 4.5 ? 'Needs fundamental skill building' : 'Continue practising for consistency',
        ],
      },
    };
  });
}

export async function seedIASessions(
  studentMap: Map<string, StudentRecord>,
  dryRun: boolean
): Promise<void> {
  console.log('\n[seedIASessions] START');
  let created = 0;
  let skipped = 0;

  for (const persona of PERSONAS) {
    const record = studentMap.get(persona.email);
    if (!record) {
      console.log(`  [WARN] No studentId for ${persona.email} — skipping IASessions`);
      continue;
    }
    const { studentId } = record;

    if (!dryRun) {
      const existingCount = await prisma.iASession.count({ where: { student_id: studentId } });
      if (existingCount > 0) {
        console.log(`  [SKIP] IASessions already exist for ${persona.email} (${existingCount} found)`);
        skipped += existingCount;
        continue;
      }
    }

    // ── Schedule-aligned IAs ──────────────────────────────────────────────────
    // The app derives IA days from firstDrill + 3,6,9… (IA_INTERVAL_DAYS = 3) and
    // retroactively marks any PAST scheduled day with no session as MISSED (−20).
    // So we seed a COMPLETED IA on EVERY past scheduled day → nothing gets missed.
    // firstDrill offset matches seedDrills: active = drillCount-1; at-risk = 12 (i=0).
    const firstDrillOffset = persona.atRisk ? 12 : persona.drillCount - 1;
    const slots: Array<{ iaNumber: number; off: number }> = [];
    for (let k = 1; ; k++) {
      const off = firstDrillOffset - k * 3;
      if (off <= 0) break;                  // off 0 = today (pending, not missed); <0 = future
      slots.push({ iaNumber: k, off });     // ascending k = oldest → newest
    }

    // Kiran (dropout): complete ONLY the oldest scheduled IA; the app marks the rest
    // MISSED on view — that IS the dropout signal. Everyone else completes all slots.
    const toSeed = persona.isDropout ? slots.slice(0, 1) : slots;

    for (let index = 0; index < toSeed.length; index++) {
      const slot = toSeed[index];
      const iaDate = daysAgo(slot.off);
      const windowCloses = new Date(iaDate.getTime() + 24 * 60 * 60 * 1000);
      const submitted = new Date(iaDate.getTime() + 2 * 60 * 60 * 1000);
      const scores = buildIAScores(persona, index, toSeed.length);
      const jitter = Math.round(seededRand(`mom-ia-${persona.email}-${slot.iaNumber}`, -2, 3));
      const momentum = persona.momentumBase + jitter; // per-session award on the row

      if (dryRun) {
        console.log(`  [DRY-RUN] Would insert COMPLETED IA #${slot.iaNumber} (~${slot.off}d ago) for ${persona.email}`);
        continue;
      }

      await prisma.iASession.create({
        data: {
          student_id: studentId,
          ia_number: slot.iaNumber,
          ia_date: iaDate,
          status: 'COMPLETED',
          selected_subskills: (scores as any[]).map((s) => s.sub_skill),
          question_ids: [],
          answers: {},
          time_started_at: iaDate,
          time_submitted_at: submitted,
          window_closes_at: windowCloses,
          scores,
          momentum_awarded: momentum,
          carry_forward_subskills: [],
        },
      });
      created++;
    }

    // Note: momentum_score is seeded directly in createStudents; not incremented here.
    if (persona.isDropout) {
      console.log(`  [OK] ${persona.name}: 1 completed IA; app marks later scheduled IAs MISSED (dropout)`);
    } else {
      console.log(`  [OK] ${toSeed.length} IASession(s) for ${persona.email}`);
    }
  }

  console.log(`[seedIASessions] DONE — created ${created}, skipped ${skipped}\n`);
}

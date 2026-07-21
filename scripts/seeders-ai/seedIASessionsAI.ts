/**
 * AI variant of seedIASessions — identical IA schedule + designed bands, but each
 * Writing/Speaking sub-skill's ai_feedback comes from REAL Gemini grading cached in
 * seedFeedback.json (genSeedFeedback.ts). Listening/Reading stay computed. Missing
 * cache entries fall back to the original templated rationale so seeding never breaks.
 *
 * Drop-in: same signature as seedIASessions, so runSeedAI can swap it in.
 */
import * as fs from 'fs';
import * as path from 'path';
import prisma from '../../src/lib/prisma';
import { PERSONAS, type Persona } from '../seeders/personas';
import { noisyBand, seededRand, daysAgo } from '../seeders/utils';
import type { StudentRecord } from '../seeders/createStudents';
import { IA_SUBSKILL_SETS } from './iaPlan';

const CACHE = path.join(__dirname, 'seedFeedback.json');

function loadCache(): Record<string, any> {
  if (!fs.existsSync(CACHE)) {
    console.log('  [WARN] seedFeedback.json not found — IA feedback will be TEMPLATED.');
    console.log('         Run scripts/seeders-ai/genSeedFeedback.ts first for real AI feedback.');
    return {};
  }
  return JSON.parse(fs.readFileSync(CACHE, 'utf8'));
}

function personaMeanBand(persona: Persona): number {
  const b = persona.diagnosticBand;
  return (b.LISTENING + b.READING + b.WRITING + b.SPEAKING) / 4;
}

function templatedFeedback(band: number, subSkill: string) {
  return {
    rationale: `Student shows ${band >= 6 ? 'good' : band >= 4.5 ? 'developing' : 'limited'} competency in ${subSkill.toLowerCase()}.`,
    key_observations: [
      band < 5 ? 'Significant errors present' : 'Mostly accurate responses',
      band < 4.5 ? 'Needs fundamental skill building' : 'Continue practising for consistency',
    ],
  };
}

/** Build IA scores for one session. Pulls REAL ai_feedback from cache by ia_number+sub_skill. */
function buildIAScores(persona: Persona, index: number, count: number, iaNumber: number, cache: any): object[] {
  const set = IA_SUBSKILL_SETS[index % IA_SUBSKILL_SETS.length];
  const mean = personaMeanBand(persona);
  const declining = persona.atRisk && !persona.isDropout;
  const isNewest = index === count - 1;
  const base = declining ? (isNewest && count > 1 ? mean - 1.5 : mean) : mean + index * 0.4;

  const iaGraded = cache[persona.email]?.ia?.[String(iaNumber)]?.graded ?? {};

  return set.map((entry) => {
    const band = noisyBand(base, `ia-${entry.sub_skill}-${persona.email}-${index}`, 0.3);
    const total = 4;
    const correct = Math.round(persona.accuracyRate * total);

    // Match production (iaProcessor.ts: ai_graded = aiQs.length > 0): only Writing/Speaking
    // sections have AI prompts, so only they are ai_graded. Listening/Reading are MCQ-only.
    const isAISkill = entry.skill === 'WRITING' || entry.skill === 'SPEAKING';
    if (!isAISkill) {
      return { skill: entry.skill, sub_skill: entry.sub_skill, band, correct, total, ai_graded: false };
    }

    // Real grade text if we generated one for this sub-skill; else templated.
    const real = iaGraded[entry.sub_skill];
    const ai_feedback = real
      ? { rationale: real.rationale, key_observations: real.key_observations }
      : templatedFeedback(band, entry.sub_skill);
    return {
      skill: entry.skill,
      sub_skill: entry.sub_skill,
      band,
      correct,
      total,
      ai_graded: true,
      ai_feedback,
    };
  });
}

export async function seedIASessionsAI(
  studentMap: Map<string, StudentRecord>,
  dryRun: boolean
): Promise<void> {
  console.log('\n[seedIASessionsAI] START');
  const cache = loadCache();
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

    // Schedule-aligned IAs — identical math to seedIASessions / iaPlan.
    const firstDrillOffset = persona.atRisk ? 12 : persona.drillCount - 1;
    const slots: Array<{ iaNumber: number; off: number }> = [];
    for (let k = 1; ; k++) {
      const off = firstDrillOffset - k * 3;
      if (off <= 0) break;
      slots.push({ iaNumber: k, off });
    }
    const toSeed = persona.isDropout ? slots.slice(0, 1) : slots;
    const hasReal = !!cache[persona.email]?.ia;

    for (let index = 0; index < toSeed.length; index++) {
      const slot = toSeed[index];
      const iaDate = daysAgo(slot.off);
      const windowCloses = new Date(iaDate.getTime() + 24 * 60 * 60 * 1000);
      const submitted = new Date(iaDate.getTime() + 2 * 60 * 60 * 1000);
      const scores = buildIAScores(persona, index, toSeed.length, slot.iaNumber, cache);
      const jitter = Math.round(seededRand(`mom-ia-${persona.email}-${slot.iaNumber}`, -2, 3));
      const momentum = persona.momentumBase + jitter;

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

    if (persona.isDropout) {
      console.log(`  [OK] ${persona.name}: 1 completed IA; app marks later scheduled IAs MISSED (dropout)`);
    } else {
      console.log(`  [OK] ${toSeed.length} IASession(s) for ${persona.email}${hasReal ? ' (real W/S feedback)' : ' (templated)'}`);
    }
  }

  console.log(`[seedIASessionsAI] DONE — created ${created}, skipped ${skipped}\n`);
}

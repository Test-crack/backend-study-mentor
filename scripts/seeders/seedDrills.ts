/**
 * TC-04: Seed DrillSession history for all 12 personas.
 *
 * Sessions spread over the last 14 days.
 * Kiran's last 2 sessions are abandoned (correct_answers = 0, status = STARTED).
 * All other sessions are APPLY_DONE.
 */

import prisma from '../../src/lib/prisma';
import { PERSONAS, type Persona } from './personas';
import { seededRand, daysAgo } from './utils';
import type { StudentRecord } from './createStudents';

// Skills + their typical sub-skills for drills
const SKILL_SUBSKILLS: Record<string, string[]> = {
  LISTENING: ['LISTENING'],
  READING:   ['READING'],
  WRITING:   ['GRAMMAR', 'VOCABULARY', 'COHERENCE', 'TASK_RESPONSE'],
  SPEAKING:  ['FLUENCY', 'PRONUNCIATION', 'VOCABULARY', 'GRAMMAR'],
};

function pickSubSkill(skill: string, seed: string): string {
  const options = SKILL_SUBSKILLS[skill] ?? [skill];
  const idx = Math.floor(seededRand(seed, 0, options.length));
  return options[Math.min(idx, options.length - 1)];
}

function sessionSkill(idx: number, persona: Persona): string {
  const skills = ['LISTENING', 'READING', 'WRITING', 'SPEAKING'];
  // Anjali: favour L/R for first half, W/S for second half
  if (persona.name === 'Anjali Suresh') {
    return idx < Math.ceil(persona.drillCount / 2) ? skills[idx % 2] : skills[2 + (idx % 2)];
  }
  return skills[idx % 4];
}

export async function seedDrills(
  studentMap: Map<string, StudentRecord>,
  dryRun: boolean
): Promise<void> {
  console.log('\n[seedDrills] START');
  let created = 0;
  let skipped = 0;

  for (const persona of PERSONAS) {
    const record = studentMap.get(persona.email);
    if (!record) {
      console.log(`  [WARN] No studentId for ${persona.email} — skipping drills`);
      continue;
    }
    const { studentId } = record;

    if (!dryRun) {
      const existingCount = await prisma.drillSession.count({ where: { student_id: studentId } });
      if (existingCount > 0) {
        console.log(`  [SKIP] DrillSessions already exist for ${persona.email} (${existingCount} found)`);
        skipped += existingCount;
        continue;
      }
    }

    for (let i = 0; i < persona.drillCount; i++) {
      const skill = sessionSkill(i, persona);
      const subSkill = pickSubSkill(skill, `subskill-${persona.email}-${i}`);

      // Kiran's last 2 sessions are abandoned
      const isAbandoned = persona.isDropout && i >= persona.drillCount - 2;

      // ── Date spread (all within the dashboard's 14-day heatmap window: offsets 0–13) ──
      // Active personas: ONE drill per consecutive day ending today (offset = i), so the
      //   activity calendar fills a solid run, the Daily-DCS chart shows a bar per day, and
      //   daily_streak (set to drillCount in createStudents) matches the visible run exactly.
      // At-risk personas: stale, descending dates (most recent >= 3 days ago) so the
      //   "No activity for N days" + "Streak broken" flags fire. For Kiran the abandoned
      //   tail (higher i) lands most-recent, matching the "engaged then dropped off" story.
      const dayOffset = persona.atRisk
        ? Math.max(3, 12 - i * 2)
        : i; // consecutive days: 0 = today, 1 = yesterday, ...
      const createdAt = daysAgo(dayOffset);

      const accuracySeed = `acc-${persona.email}-${i}`;
      const jitter = seededRand(accuracySeed, -0.05, 0.05);

      let accuracy: number;
      if (persona.skillAccuracy && persona.skillAccuracy[skill as keyof typeof persona.skillAccuracy] !== undefined) {
        // Asymmetric persona (Anjali): accuracy is driven per-skill, so W/S drills are
        // genuinely weaker than L/R drills — not a flat average.
        accuracy = Math.min(1, Math.max(0, persona.skillAccuracy[skill as keyof typeof persona.skillAccuracy]! + jitter));
      } else if (persona.isErratic) {
        // Lena: oscillates between ~35% and ~90%
        accuracy = i % 2 === 0 ? 0.35 + seededRand(accuracySeed, 0, 0.1) : 0.85 + seededRand(accuracySeed, 0, 0.08);
      } else if (persona.isDropout && !isAbandoned) {
        // Kiran: completed drills decline 0.52 → 0.45 → 0.38 (visible in drill analytics,
        // not just the force-zeroed abandoned tail).
        accuracy = Math.max(0.1, 0.52 - 0.07 * i);
      } else {
        accuracy = Math.min(1, Math.max(0, persona.accuracyRate + jitter));
      }

      const totalQ = 5;
      const correctAnswers = isAbandoned ? 0 : Math.round(accuracy * totalQ);
      const promptsCompleted = isAbandoned ? 1 : totalQ;
      const momentumEarned = isAbandoned ? 0 : Math.round(seededRand(`mom-${persona.email}-${i}`, 3, 10));
      const status = isAbandoned ? 'STARTED' : 'APPLY_DONE';

      if (dryRun) {
        console.log(
          `  [DRY-RUN] Would insert DrillSession ${skill}/${subSkill} ` +
          `correct=${correctAnswers}/${totalQ} status=${status} for ${persona.email}`
        );
        continue;
      }

      await prisma.drillSession.create({
        data: {
          student_id: studentId,
          skill: skill as any,
          sub_skill: subSkill as any,
          prompts_completed: promptsCompleted,
          momentum_earned: momentumEarned,
          correct_answers: correctAnswers,
          total_questions: totalQ,
          status: status as any,
          created_at: createdAt,
          drill_completed_at: isAbandoned ? null : createdAt,
          apply_completed_at: isAbandoned ? null : createdAt,
        },
      });

      created++;
    }

    console.log(`  [OK] ${persona.drillCount} DrillSessions for ${persona.email}`);
  }

  console.log(`[seedDrills] DONE — created ${created}, skipped ${skipped}\n`);
}

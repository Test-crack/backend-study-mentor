/**
 * TC-03: Seed AssessmentHistory (diagnostic) + StudentCompetencyMatrix
 * for all 12 personas.
 *
 * Uses static feedback text — no Gemini calls.
 * JSONB shapes match exactly what the dashboard parses.
 */

import prisma from '../../src/lib/prisma';
import { PERSONAS, type Persona } from './personas';
import { noisyBand, seededRand, pickFeedback, writingFeedback, speakingFeedback } from './utils';
import type { StudentRecord } from './createStudents';

const SKILLS = ['LISTENING', 'READING', 'WRITING', 'SPEAKING'] as const;
type Skill = (typeof SKILLS)[number];

/** Per-skill accuracy: skillAccuracy override (asymmetric personas) else base rate. */
function skillAccuracy(persona: Persona, skill: Skill): number {
  return persona.skillAccuracy?.[skill] ?? persona.accuracyRate;
}

function buildSubScores(skill: Skill, persona: Persona, band: number): Record<string, any> {
  if (skill === 'WRITING') {
    // Matches diagnosticController.ts WRITING sub_scores + analyzeWriting() feedback shape.
    return {
      word_count: Math.round(seededRand(`wc-${persona.email}`, 220, 310)),
      grammarScore: noisyBand(band, `gram-${persona.email}`),
      vocabularyScore: noisyBand(band, `vocab-${persona.email}`),
      coherenceScore: noisyBand(band, `coh-${persona.email}`),
      taskResponseScore: noisyBand(band + 0.5, `tr-${persona.email}`),
      feedback: writingFeedback(band, persona.email),
    };
  }

  if (skill === 'SPEAKING') {
    // Matches submitDiagnosticSpeaking sub_scores + analyzeSpeaking() feedback shape.
    return {
      content_assessment: 'adequate',
      fluencyScore: noisyBand(band, `fl-${persona.email}`),
      vocabularyScore: noisyBand(band, `svocab-${persona.email}`),
      grammarScore: noisyBand(band, `sgram-${persona.email}`),
      pronunciationScore: noisyBand(band, `pron-${persona.email}`),
      feedback: speakingFeedback(band, persona.email),
    };
  }

  // LISTENING / READING — matches diagnosticController.ts L/R sub_scores exactly.
  const acc = skillAccuracy(persona, skill);
  const total = 40;
  const correct = Math.round(acc * total);
  // by_question_type: { <type>: { correct, total } } — split the 40 across two types.
  const t1 = Math.round(total * 0.6);
  const t2 = total - t1;
  const c1 = Math.min(correct, t1);
  const c2 = correct - c1;
  return {
    total_questions: total,
    correct_answers: correct,
    accuracy_percentage: Math.round(acc * 100),
    by_question_type:
      skill === 'LISTENING'
        ? { multiple_choice: { correct: c1, total: t1 }, form_completion: { correct: c2, total: t2 } }
        : { true_false_notgiven: { correct: c1, total: t1 }, matching_headings: { correct: c2, total: t2 } },
  };
}

export async function seedDiagnostics(
  studentMap: Map<string, StudentRecord>,
  dryRun: boolean
): Promise<void> {
  console.log('\n[seedDiagnostics] START');
  let created = 0;
  let skipped = 0;

  for (const persona of PERSONAS) {
    const record = studentMap.get(persona.email);
    if (!record) {
      console.log(`  [WARN] No studentId for ${persona.email} — skipping diagnostics`);
      continue;
    }
    const { studentId } = record;

    for (const skill of SKILLS) {
      // Check if diagnostic already exists (skip the DB query for dry-run placeholder ids).
      if (!dryRun) {
        const existing = await prisma.assessmentHistory.findFirst({
          where: { student_id: studentId, skill, mode: 'DIAGNOSTIC' },
        });
        if (existing) {
          console.log(`  [SKIP] Diagnostic ${skill} already exists for ${persona.email}`);
          skipped++;
          continue;
        }
      }

      const baseBand = persona.diagnosticBand[skill as keyof typeof persona.diagnosticBand];
      const band = noisyBand(baseBand, `${skill}-${persona.email}`);
      const subScores = buildSubScores(skill, persona, band);

      if (dryRun) {
        console.log(`  [DRY-RUN] Would insert AssessmentHistory ${skill} band=${band} for ${persona.email}`);
        continue;
      }

      await prisma.assessmentHistory.create({
        data: {
          student_id: studentId,
          skill,
          mode: 'DIAGNOSTIC',
          band_score: band,
          sub_scores: subScores,
          feedback_json: { summary: pickFeedback(band, `diag-${skill}-${persona.email}`) },
        },
      });

      // Upsert StudentCompetencyMatrix
      await prisma.studentCompetencyMatrix.upsert({
        where: { student_id_skill: { student_id: studentId, skill } },
        update: { band_score: band, last_updated: new Date() },
        create: {
          student_id: studentId,
          skill,
          band_score: band,
          assessments_count: 1,
          last_updated: new Date(),
        },
      });

      created++;
    }

    // Mark student as diagnosed so the instructor dashboard includes them.
    // This mirrors what diagnosticController.ts does on real submission.
    if (!dryRun) {
      await prisma.institute_students.update({
        where: { id: studentId },
        data: { isDiagnosed: true },
      });
    }
  }

  console.log(`[seedDiagnostics] DONE — created ${created}, skipped ${skipped}\n`);
}

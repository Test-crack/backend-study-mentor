/**
 * AI variant of seedDiagnostics — identical numbers (designed bands), but the WRITING
 * and SPEAKING feedback text comes from REAL Gemini grading cached in seedFeedback.json
 * (built by genSeedFeedback.ts). If the cache is missing an entry, it falls back to the
 * original templated feedback so seeding never breaks. Listening/Reading are unchanged.
 *
 * Drop-in: same signature as seedDiagnostics, so runSeedAI can swap it in.
 */
import * as fs from 'fs';
import * as path from 'path';
import prisma from '../../src/lib/prisma';
import { PERSONAS, type Persona } from '../seeders/personas';
import { noisyBand, seededRand, pickFeedback, writingFeedback, speakingFeedback } from '../seeders/utils';
import type { StudentRecord } from '../seeders/createStudents';

const SKILLS = ['LISTENING', 'READING', 'WRITING', 'SPEAKING'] as const;
type Skill = (typeof SKILLS)[number];

const CACHE = path.join(__dirname, 'seedFeedback.json');

function loadCache(): Record<string, any> {
  if (!fs.existsSync(CACHE)) {
    console.log('  [WARN] seedFeedback.json not found — diagnostics will use TEMPLATED feedback.');
    console.log('         Run scripts/seeders-ai/genSeedFeedback.ts first for real AI feedback.');
    return {};
  }
  return JSON.parse(fs.readFileSync(CACHE, 'utf8'));
}

function skillAccuracy(persona: Persona, skill: Skill): number {
  return persona.skillAccuracy?.[skill] ?? persona.accuracyRate;
}

/** Map cached per-criterion IA grades into the diagnostic speaking feedback shape. */
function mapSpeakingFeedback(byCrit: any, band: number, email: string): Record<string, unknown> {
  if (!byCrit?.FLUENCY) return speakingFeedback(band, email); // fallback
  const block = (c: string, errorsKey = false) => {
    const g = byCrit[c];
    if (!g) return undefined;
    const obs: string[] = g.key_observations ?? [];
    const base = { score_rationale: g.rationale, next_step: obs[obs.length - 1] ?? '' };
    return errorsKey ? { ...base, error_examples: obs.slice(0, 2) } : { ...base, observed_issues: obs.slice(0, 2) };
  };
  return {
    fluency: block('FLUENCY'),
    vocabulary: block('VOCABULARY'),
    grammar: block('GRAMMAR', true),
    pronunciation: block('PRONUNCIATION'),
    filler_words_detected: band < 5 ? ['um', 'uh', 'like'] : ['um'],
    priority_action: byCrit.FLUENCY?.rationale ?? '',
  };
}

function buildSubScores(skill: Skill, persona: Persona, band: number, cache: any): Record<string, any> {
  const diag = cache[persona.email]?.diagnostic;

  if (skill === 'WRITING') {
    // Real analyzeWriting feedback if cached (already in the dashboard's shape); else template.
    const feedback = diag?.WRITING?.graded?.feedback ?? writingFeedback(band, persona.email);
    return {
      word_count: Math.round(seededRand(`wc-${persona.email}`, 220, 310)),
      grammarScore: noisyBand(band, `gram-${persona.email}`),
      vocabularyScore: noisyBand(band, `vocab-${persona.email}`),
      coherenceScore: noisyBand(band, `coh-${persona.email}`),
      taskResponseScore: noisyBand(band + 0.5, `tr-${persona.email}`),
      feedback,
    };
  }

  if (skill === 'SPEAKING') {
    const feedback = mapSpeakingFeedback(diag?.SPEAKING?.by_criterion, band, persona.email);
    return {
      content_assessment: 'adequate',
      fluencyScore: noisyBand(band, `fl-${persona.email}`),
      vocabularyScore: noisyBand(band, `svocab-${persona.email}`),
      grammarScore: noisyBand(band, `sgram-${persona.email}`),
      pronunciationScore: noisyBand(band, `pron-${persona.email}`),
      feedback,
    };
  }

  // LISTENING / READING — unchanged (MCQ accuracy, deterministic).
  const acc = skillAccuracy(persona, skill);
  const total = 40;
  const correct = Math.round(acc * total);
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

export async function seedDiagnosticsAI(
  studentMap: Map<string, StudentRecord>,
  dryRun: boolean
): Promise<void> {
  console.log('\n[seedDiagnosticsAI] START');
  const cache = loadCache();
  let created = 0;
  let skipped = 0;

  for (const persona of PERSONAS) {
    const record = studentMap.get(persona.email);
    if (!record) {
      console.log(`  [WARN] No studentId for ${persona.email} — skipping diagnostics`);
      continue;
    }
    const { studentId } = record;
    const hasReal = !!cache[persona.email]?.diagnostic;

    for (const skill of SKILLS) {
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
      const subScores = buildSubScores(skill, persona, band, cache);

      if (dryRun) {
        const src = (skill === 'WRITING' || skill === 'SPEAKING') && hasReal ? 'REAL' : 'template';
        console.log(`  [DRY-RUN] Would insert AssessmentHistory ${skill} band=${band} (${src} feedback) for ${persona.email}`);
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

    if (!dryRun) {
      await prisma.institute_students.update({
        where: { id: studentId },
        data: { isDiagnosed: true },
      });
      console.log(`  [OK] Diagnostics for ${persona.email}${hasReal ? ' (real W/S feedback)' : ' (templated — no cache)'}`);
    }
  }

  console.log(`[seedDiagnosticsAI] DONE — created ${created}, skipped ${skipped}\n`);
}

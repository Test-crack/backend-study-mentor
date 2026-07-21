/**
 * IA flow for the student bot.
 *
 * Self-gating: only acts when the app says this student's IA is actually due
 * (is_ia_day + eligible/in-progress, not already done). Everyone else is skipped.
 *
 * MCQ/TFNG: /questions strips correct_answer, so we look it up from the IAQuestion
 * table (DB) and answer the persona's target proportion correctly.
 * WRITING_PROMPT/SPEAKING_PROMPT: we look up a pre-built, on-topic model answer
 * (iaAnswers.json, by question_id + persona tier). If a prompt isn't in that file
 * yet, we fall back to a live Gemini generation. Either way the answer is on-topic,
 * so the real grader returns believable feedback (not "off-topic").
 */
import * as fs from 'fs';
import * as path from 'path';
import { api, cleanAnswer } from './botClient';
import { generateAnswer } from './genAnswer';
import prisma from '../../src/lib/prisma';
import type { Persona } from '../seeders/personas';

// Pre-built answers (run genIAAnswers.ts to populate). Loaded once.
const ANSWERS_PATH = path.join(__dirname, 'iaAnswers.json');
let savedAnswers: Record<string, { kind: string; low: string; mid: string; high: string }> = {};
try {
  if (fs.existsSync(ANSWERS_PATH)) savedAnswers = JSON.parse(fs.readFileSync(ANSWERS_PATH, 'utf8'));
} catch { /* no file yet — all prompts fall back to live generation */ }

const isPrompt = (t: string) => t.toUpperCase().includes('PROMPT');
const isSpeaking = (t: string) => t.toUpperCase().includes('SPEAK');
const tierForBand = (band: number): 'low' | 'mid' | 'high' => (band >= 6 ? 'high' : band >= 4.5 ? 'mid' : 'low');

function meanBand(p: Persona): number {
  const b = p.diagnosticBand;
  return (b.LISTENING + b.READING + b.WRITING + b.SPEAKING) / 4;
}

/** On-topic W/S answer: pre-built lookup first, live-generate as fallback. */
async function promptAnswer(persona: Persona, questionId: string, promptText: string, skill: string, qtype: string): Promise<string> {
  const band = (persona.diagnosticBand as any)[skill.toUpperCase()] ?? meanBand(persona);
  const tier = tierForBand(band);
  const saved = savedAnswers[questionId];
  if (saved && saved[tier]) return saved[tier];
  return generateAnswer(promptText, isSpeaking(qtype) ? 'SPEAKING' : 'WRITING', band);
}

/** Pick a wrong-but-plausible answer different from the correct one. */
function wrongAnswer(correct: string, options: unknown): string {
  if (options && typeof options === 'object' && !Array.isArray(options)) {
    const other = Object.keys(options as Record<string, unknown>).find(k => k.toUpperCase() !== correct.toUpperCase());
    if (other) return other;
  }
  const up = correct.toUpperCase();
  if (up === 'TRUE') return 'FALSE';
  if (up === 'FALSE') return 'TRUE';
  return '__wrong';
}

export interface IAResult { did: boolean; reason?: string; ia_number?: number }

export async function doIA(persona: Persona, token: string): Promise<IAResult> {
  const status = await api('GET', '/api/ia/status', token);
  if (!status.is_ia_day)            return { did: false, reason: 'not an IA day' };
  if (status.has_completed_session) return { did: false, reason: 'already done today' };
  if (!status.can_start_test && !status.has_active_session) return { did: false, reason: 'not eligible' };

  const q = await api('GET', '/api/ia/questions', token);
  if (q.already_done) return { did: false, reason: 'already done' };
  const sessionId: string = q.session_id;
  const sections: any[] = q.sections ?? [];

  // Answer key for MCQ/TFNG — stripped from the API, fetched from the DB.
  const allIds: string[] = sections.flatMap(s => (s.questions ?? []).map((qq: any) => qq.id));
  const rows = await prisma.iAQuestion.findMany({
    where: { id: { in: allIds } },
    select: { id: true, question_type: true, correct_answer: true, options: true },
  });
  const keyById = new Map(rows.map(r => [r.id, r]));

  for (let i = 0; i < sections.length; i++) {
    if (i > 0) await api('POST', '/api/ia/answer', token, { session_id: sessionId, section_advance: i });

    const skill = String(sections[i].skill ?? '');
    const questions: any[] = sections[i].questions ?? [];
    const mcqCount = questions.filter(qq => !isPrompt(qq.question_type ?? '')).length;
    const target = Math.round(persona.accuracyRate * mcqCount);
    let correctSoFar = 0;

    for (const qq of questions) {
      const qtype = String(qq.question_type ?? keyById.get(qq.id)?.question_type ?? '');
      let answer: string;

      if (isPrompt(qtype)) {
        answer = await promptAnswer(persona, qq.id, qq.prompt_text ?? '', skill, qtype);
      } else {
        const correct = cleanAnswer(keyById.get(qq.id)?.correct_answer);
        if (correctSoFar < target) { answer = correct; correctSoFar++; }
        else { answer = wrongAnswer(correct, qq.options ?? keyById.get(qq.id)?.options); }
      }

      await api('POST', '/api/ia/answer', token, { session_id: sessionId, question_id: qq.id, answer });
    }
  }

  await api('POST', '/api/ia/submit', token, { session_id: sessionId });
  return { did: true, ia_number: q.ia_number };
}

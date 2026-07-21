/**
 * Bot flows — real-API actions a student performs. Each calls the same endpoints
 * the frontend calls, so the app's real logic (grading, momentum, streak) runs.
 */
import { api, cleanAnswer } from './botClient';
import type { Persona } from '../seeders/personas';

// IELTS band → drill difficulty (mirrors getDifficulty in iaController)
const levelFor = (band: number) => (band < 5.5 ? 'BEGINNER' : band >= 7 ? 'ADVANCED' : 'INTERMEDIATE');

/** Do ONE drill end-to-end: start → complete → apply-done. Returns the app's result. */
export async function doDrill(persona: Persona, token: string, skill: string, subSkill: string) {
  const band = persona.diagnosticBand[skill as keyof typeof persona.diagnosticBand];
  const start = await api('POST', '/api/drills/start', token, { skill, sub_skill: subSkill, level: levelFor(band) });
  const sessionId: string = start.session_id;
  const questions: any[] = start.questions ?? [];
  if (!sessionId || questions.length === 0) return { skill, subSkill, skipped: true as const };

  // Answer to the persona's target accuracy. /complete trusts the reported count,
  // but we fill realistic answers from each question's key (returned by /start).
  const total = questions.length;
  const target = Math.round(persona.accuracyRate * total);
  const answers: Record<string, string> = {};
  questions.forEach((q, i) => { answers[q.id] = i < target ? cleanAnswer(q.correct_answer) : '__wrong'; });

  const done = await api('POST', `/api/drills/session/${sessionId}/complete`, token, { answers, correct_answers: target });
  await api('POST', `/api/drills/session/${sessionId}/apply-done`, token, {});
  return { skill, subSkill, correct: target, total, momentum: done.momentum_score, streak: done.daily_streak };
}

/** Play one LexiGrid game for the day. Words scale with persona level.
 *
 * The backend now signs the served word set (signLexiGridSession) and returns a
 * session_token from GET /lexigrid-words; /game-score verifies it. A missing token
 * is accepted but awards ZERO momentum, so the bot must fetch real words first and
 * echo back the token + the ids it "played". */
export async function doLexiGrid(persona: Persona, token: string) {
  // Use the persona's average band to pick a difficulty bucket (mirrors levelFor).
  const bands = Object.values(persona.diagnosticBand) as number[];
  const avgBand = bands.reduce((a, b) => a + b, 0) / bands.length;
  const difficulty = levelFor(avgBand);

  // Fetch today's word set — this is what mints the signed session_token.
  const set = await api('GET', `/api/student/lexigrid-words?difficulty=${difficulty}`, token);
  const served: any[] = set.data ?? [];
  const sessionToken: string | undefined = set.session_token;

  // Solve count scales with persona, but can never exceed the words actually served
  // (the token's verify rejects words_solved > served.length).
  const words = Math.min(persona.atRisk ? 3 : 5, served.length);
  const playedIds = served.slice(0, words).map((w) => w.id);

  return api('POST', '/api/student/game-score', token, {
    game_type: 'LEXIGRID',
    words_solved: words,
    total_attempts: words + 1,
    bonus_eligible: words >= 5,
    session_token: sessionToken,
    played_word_ids: playedIds,
  });
}

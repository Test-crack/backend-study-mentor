/**
 * Student bot — SLICE 1 + 2: prove real auth + one real drill end-to-end.
 *
 * This is the proof-of-concept for Paul's "student that actually goes through the
 * platform." It authenticates as ONE persona and does ONE drill via the real API
 * (start → complete → apply-done), then prints what the app returned.
 *
 * Usage (backend must be running and reachable at API_BASE_URL):
 *   npx ts-node --project tsconfig.dev.json scripts/bot/runBot.ts
 *   npx ts-node --project tsconfig.dev.json scripts/bot/runBot.ts --email arjun.menon@seed.testcrack.dev --skill LISTENING
 */
import 'dotenv/config'; // MUST be first — loads SUPABASE_* / API_BASE_URL before botClient reads them
import { Command } from 'commander';
import { PERSONAS } from '../seeders/personas';
import { getToken, api, cleanAnswer, API_BASE } from './botClient';

const program = new Command();
program
  .option('--email <email>', 'persona email', 'arjun.menon@seed.testcrack.dev')
  .option('--skill <skill>', 'drill skill', 'LISTENING');
program.parse(process.argv);
const opts = program.opts<{ email: string; skill: string }>();

// IELTS band → drill difficulty level (mirrors getDifficulty in iaController)
const levelFor = (band: number) => (band < 5.5 ? 'BEGINNER' : band >= 7 ? 'ADVANCED' : 'INTERMEDIATE');
// default sub_skill per skill
const SUBSKILL: Record<string, string> = { LISTENING: 'LISTENING', READING: 'READING', WRITING: 'GRAMMAR', SPEAKING: 'FLUENCY' };

async function main() {
  const persona = PERSONAS.find(p => p.email === opts.email);
  if (!persona) throw new Error(`No persona with email ${opts.email}`);

  const skill = opts.skill.toUpperCase();
  const subSkill = SUBSKILL[skill];
  const level = levelFor(persona.diagnosticBand[skill as keyof typeof persona.diagnosticBand]);

  console.log('═══════════════════════════════════════════════════');
  console.log('  Student Bot — slice 1+2 (auth + one real drill)');
  console.log(`  API:     ${API_BASE}`);
  console.log(`  Persona: ${persona.name} <${persona.email}>`);
  console.log(`  Drill:   ${skill}/${subSkill} @ ${level}, target accuracy ${Math.round(persona.accuracyRate * 100)}%`);
  console.log('═══════════════════════════════════════════════════\n');

  // ── Slice 1: real auth ──────────────────────────────────────────────────────
  console.log('[1] Authenticating…');
  const token = await getToken(persona);
  console.log(`    ✓ got JWT (${token.slice(0, 20)}…)\n`);

  // ── Slice 2: one real drill via the API ─────────────────────────────────────
  console.log('[2] Starting drill (POST /api/drills/start)…');
  const start = await api('POST', '/api/drills/start', token, { skill, sub_skill: subSkill, level });
  const sessionId: string = start.session_id;
  const questions: any[] = start.questions ?? [];
  console.log(`    ✓ session ${sessionId}, ${questions.length} questions`);

  // Answer to hit the persona's target accuracy. /complete trusts the reported
  // correct_answers count, but we fill realistic answers from each question's key.
  const total = questions.length;
  const targetCorrect = Math.round(persona.accuracyRate * total);
  const answers: Record<string, string> = {};
  questions.forEach((q, i) => {
    const key = cleanAnswer(q.correct_answer);
    answers[q.id] = i < targetCorrect ? key : `__wrong_${key}`; // wrong sentinel for the rest
  });
  console.log(`    answering ${targetCorrect}/${total} correctly`);

  console.log('[3] Completing drill (POST …/complete)…');
  const done = await api('POST', `/api/drills/session/${sessionId}/complete`, token, {
    answers, correct_answers: targetCorrect,
  });
  console.log(`    ✓ momentum_earned: ${done.momentum_earned}, momentum_score: ${done.momentum_score}, streak: ${done.daily_streak}`);

  console.log('[4] Apply phase (POST …/apply-done)…');
  const apply = await api('POST', `/api/drills/session/${sessionId}/apply-done`, token, {});
  console.log(`    ✓ momentum_earned: ${apply.momentum_earned}, momentum_score: ${apply.momentum_score}`);

  console.log('\n✅ Done. A REAL drill was created and graded by the app for this student.');
  console.log('   Verify on the dashboard: the drill + momentum/streak should reflect this run.');
}

main().catch((e) => { console.error('\n❌ ERROR:', e.message); process.exit(1); });

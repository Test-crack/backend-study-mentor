/**
 * ONE-TIME batch: pre-generate model answers for every Writing/Speaking prompt in
 * the IAQuestion bank, at 3 band tiers (low/mid/high), and save to iaAnswers.json.
 *
 * The bot then LOOKS UP these answers by question_id at runtime instead of calling
 * Gemini every run — so the only recurring Gemini cost is the app's grading on submit.
 *
 * Idempotent + incremental: already-answered prompts are skipped, and the file is
 * saved after each prompt — so a crash/re-run resumes, and adding new prompts later
 * only generates the new ones.
 *
 * Run:
 *   npx ts-node --project tsconfig.dev.json scripts/bot/genIAAnswers.ts
 */
import 'dotenv/config'; // load GEMINI_API_KEY before genAnswer initialises
import * as fs from 'fs';
import * as path from 'path';
import prisma from '../../src/lib/prisma';
import { generateAnswer } from './genAnswer';

const OUT = path.join(__dirname, 'iaAnswers.json');
const TIERS: Array<['low' | 'mid' | 'high', number]> = [['low', 3.5], ['mid', 5.5], ['high', 7.0]];

async function main() {
  const existing: Record<string, any> = fs.existsSync(OUT)
    ? JSON.parse(fs.readFileSync(OUT, 'utf8'))
    : {};

  const prompts = await prisma.iAQuestion.findMany({
    where: { is_active: true, question_type: { in: ['WRITING_PROMPT', 'SPEAKING_PROMPT'] } },
    select: { id: true, question_type: true, prompt_text: true },
  });

  console.log(`Found ${prompts.length} Writing/Speaking prompts in the IA bank.`);
  let generated = 0, skipped = 0;

  for (const p of prompts) {
    if (existing[p.id]) { skipped++; continue; }

    const kind: 'WRITING' | 'SPEAKING' = p.question_type.toUpperCase().includes('SPEAK') ? 'SPEAKING' : 'WRITING';
    const entry: any = { kind };
    for (const [tier, band] of TIERS) {
      entry[tier] = await generateAnswer(p.prompt_text, kind, band);
    }
    existing[p.id] = entry;
    generated++;
    fs.writeFileSync(OUT, JSON.stringify(existing, null, 2)); // save after each (resumable)
    console.log(`  [${generated}] ${kind} ${p.id} — low/mid/high done`);
  }

  console.log(`\nDone. Generated ${generated}, skipped ${skipped} (already had). Saved → ${OUT}`);
}

main()
  .catch((e) => { console.error('[genIAAnswers] ERROR:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());

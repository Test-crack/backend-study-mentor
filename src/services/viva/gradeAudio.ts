// Manual grader smoke-test. Feeds ONE audio file through the Spoken English competence
// grader + aggregation, and prints the result. Needs GEMINI_API_KEY (from .env).
//   npx ts-node --transpile-only src/services/viva/gradeAudio.ts <audioFile> [mimeType] ["prompt text"]
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { geminiCompetenceGrader } from './geminiCompetenceGrader';
import { aggregateViva } from './scoring';
import { SPOKEN_ENGLISH_RUBRIC } from './rubrics/spokenEnglish';

const EXT_MIME: Record<string, string> = {
  '.mp3': 'audio/mp3', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.mp4': 'audio/mp4',
  '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.webm': 'audio/webm', '.flac': 'audio/flac',
};

(async () => {
  const audioPath = process.argv[2];
  const mimeType = process.argv[3] || EXT_MIME[path.extname(audioPath || '').toLowerCase()] || 'audio/mp3';
  const promptText = process.argv[4] || 'Describe a typical day for you, from morning to evening.';

  if (!audioPath || !fs.existsSync(audioPath)) {
    console.error('usage: ts-node gradeAudio.ts <audioFile> [mimeType] ["prompt text"]');
    process.exit(1);
  }
  if (!process.env.GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY not set (put it in .env or the shell env).');
    process.exit(1);
  }

  console.log(`Grading "${audioPath}" (${mimeType}) against prompt: "${promptText}"\n`);
  const g = await geminiCompetenceGrader.grade({ audioPath, mimeType, promptText, rubric: SPOKEN_ENGLISH_RUBRIC });

  console.log('── Grader output ──────────────────────────────');
  console.log('content flag :', g.rationale, g.flags);
  console.log('word_count   :', g.wordCount);
  console.log('transcript   :', g.transcript);
  console.log('subskill levels:');
  for (const ss of SPOKEN_ENGLISH_RUBRIC.subskills) {
    console.log(`   ${ss.label.padEnd(22)} ${g.levels[ss.id] ?? '—'}`);
  }

  const cfg: any = JSON.parse(fs.readFileSync(path.join(__dirname, '../../exam-engine/exam-engine-config.v2.json'), 'utf8'));
  const result = aggregateViva(
    [{ promptId: 'smoke', wordCount: g.wordCount, flags: g.flags, levels: g.levels }],
    SPOKEN_ENGLISH_RUBRIC, cfg.scales.cefr_6,
  );
  console.log('\n── Aggregated (this one response) ─────────────');
  console.log(result);
})().catch((e) => { console.error('❌', e); process.exit(1); });

// One-off: transcribe every Spoken English diagnostic stimulus .wav with Gemini, so we
// can seed diagnostic_questions.prompt_text / passage_text from what the audio actually
// says. Reads the audio from the FRONTEND public folder. Needs GEMINI_API_KEY (.env).
//   npx ts-node --transpile-only src/services/viva/transcribeStimuli.ts [audioRootDir]
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';

const ROOT = process.argv[2]
  || 'e:/FreeLance/edtech/ai-study-mentor/public/diagnostics/spoken-english';

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : e.name.toLowerCase().endsWith('.wav') ? [p] : [];
  });
}

(async () => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) { console.error('❌ GEMINI_API_KEY not set (.env)'); process.exit(1); }
  if (!fs.existsSync(ROOT)) { console.error(`❌ audio root not found: ${ROOT}`); process.exit(1); }

  const model = new GoogleGenerativeAI(key).getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { temperature: 0 },
  });

  const files = walk(ROOT).sort();
  console.log(`Found ${files.length} .wav files under ${ROOT}\n`);

  const out: Record<string, string> = {};
  for (const f of files) {
    const rel = path.relative(ROOT, f).replace(/\\/g, '/');
    try {
      const res = await model.generateContent([
        'Transcribe this audio verbatim into English text. Return ONLY the exact spoken words, no timestamps, no commentary, no quotes.',
        { inlineData: { data: fs.readFileSync(f).toString('base64'), mimeType: 'audio/wav' } },
      ]);
      const text = res.response.text().trim().replace(/\s+/g, ' ');
      out[rel] = text;
      console.log(`── ${rel}\n${text}\n`);
    } catch (e: any) {
      out[rel] = `__ERROR__: ${e?.message ?? e}`;
      console.log(`── ${rel}\n❌ ${e?.message ?? e}\n`);
    }
  }

  console.log('\n===== JSON =====');
  console.log(JSON.stringify(out, null, 2));
})().catch((e) => { console.error('❌', e); process.exit(1); });

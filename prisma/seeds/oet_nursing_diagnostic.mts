// OET-Nursing diagnostic seed — 2 sets per skill (L/R/W/S), high-quality healthcare content.
// Listening transcripts are TTS'd (Gemini) to WAV in the frontend static dir; questions seeded to
// diagnostic_questions (exam_id='oet_nursing', level='A' — OET students resolve to A, like SE).
// Run:  DO_INSERT=1 npx tsx prisma/seeds/oet_nursing_diagnostic.mts   (omit DO_INSERT for dry-run)
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const EXAM = 'oet_nursing';
const LEVEL = 'A';
const AUDIO_DIR = path.resolve('..', 'ai-study-mentor', 'public', 'diagnostics', 'audio');
const p = new PrismaClient();

// ─── READING (2 sets, passage + 5 items each) ────────────────────────────────
const READING = [
  {
    set: 'oet_read_A_001',
    passage: `Preventing falls among elderly patients is a core nursing responsibility, particularly on hospital wards where unfamiliar surroundings increase risk. A fall can lead to fractures, loss of confidence, and prolonged admission. Nurses should complete a falls-risk assessment on admission and repeat it whenever the patient's condition changes. Key risk factors include a history of previous falls, certain medications such as sedatives and diuretics, poor vision, and impaired mobility. Practical measures are highly effective: keeping the call bell within reach, ensuring adequate lighting, providing non-slip footwear, and clearing walkways of obstacles. Patients should never be rushed when mobilising, and those identified as high-risk should be positioned in beds visible from the nurses' station. Importantly, restraints are not recommended, as they can increase agitation and injury. Instead, regular comfort rounds — checking on positioning, pain, and toileting needs — reduce the likelihood that a patient will attempt to move unaided. Educating patients and their families about these strategies encourages shared responsibility for safety.`,
    q: [
      { type: 'MCQ', prompt: 'According to the passage, when should a falls-risk assessment be repeated?', options: { A: 'Only on discharge', B: 'Whenever the patient’s condition changes', C: 'Once a week regardless of condition', D: 'Only if a fall occurs' }, ans: 'B' },
      { type: 'TFNG', prompt: 'The passage recommends using restraints for high-risk patients.', ans: 'B' },
      { type: 'MCQ', prompt: 'Which of the following is listed as a risk factor for falls?', options: { A: 'A high-fibre diet', B: 'Regular exercise', C: 'Sedative medication', D: 'Frequent visitors' }, ans: 'C' },
      { type: 'MCQ', prompt: 'What is the stated purpose of regular comfort rounds?', options: { A: 'To administer medication faster', B: 'To reduce the chance a patient moves unaided', C: 'To replace the falls-risk assessment', D: 'To limit family visits' }, ans: 'B' },
      { type: 'TFNG', prompt: 'High-risk patients should be placed where staff can easily see them.', ans: 'A' },
    ],
  },
  {
    set: 'oet_read_A_002',
    passage: `Hypertension, or persistently high blood pressure, is often called a "silent" condition because many patients experience no symptoms until complications arise. Left untreated, it significantly raises the risk of stroke, heart attack, and kidney disease. Blood pressure is recorded as two figures: systolic pressure, when the heart contracts, over diastolic pressure, when it rests. A reading consistently at or above 140/90 mmHg generally warrants review. Nurses play a central role in both detection and management. Accurate measurement technique matters: the patient should be seated and rested for at least five minutes, with the arm supported at heart level and an appropriately sized cuff. A single high reading is rarely enough to diagnose hypertension; readings should be repeated on separate occasions. Management combines lifestyle advice — reducing salt intake, increasing physical activity, limiting alcohol, and stopping smoking — with medication where necessary. Because treatment is usually lifelong, supporting patients to understand their condition and adhere to therapy is essential to preventing serious long-term harm.`,
    q: [
      { type: 'MCQ', prompt: 'Why is hypertension described as a "silent" condition?', options: { A: 'It is difficult to measure', B: 'Many patients have no symptoms until complications arise', C: 'It only affects older people', D: 'It cannot be treated' }, ans: 'B' },
      { type: 'TFNG', prompt: 'A single high reading is enough to diagnose hypertension.', ans: 'B' },
      { type: 'MCQ', prompt: 'Before measuring blood pressure, the patient should be:', options: { A: 'Standing and active', B: 'Seated and rested for at least five minutes', C: 'Lying flat with the arm raised', D: 'Walking slowly' }, ans: 'B' },
      { type: 'MCQ', prompt: 'Which reading generally warrants review, according to the passage?', options: { A: '120/80 mmHg', B: '130/85 mmHg', C: '140/90 mmHg or above', D: 'Any reading below 120/80' }, ans: 'C' },
      { type: 'TFNG', prompt: 'Treatment for hypertension is usually lifelong.', ans: 'A' },
    ],
  },
];

// ─── LISTENING (2 sets, transcript is TTS'd; 5 items each) ────────────────────
const LISTENING = [
  {
    set: 'oet_listen_A_001', voice: 'Kore',
    transcript: `Read the following in a calm, clear voice, as a nurse speaking to a patient. Good morning, Mr. Thompson. I understand you've been having a persistent cough for about two weeks now. Can you tell me a little more about it? ... I see. So the cough is worse at night and sometimes brings up a small amount of clear phlegm. Have you had any fever or chest pain? ... No fever, that's good, but you mention some tightness in your chest when you climb the stairs. Are you still using your blue inhaler? ... Right, twice a day. I'd like to check your oxygen levels and listen to your chest. Based on what you've told me, I'll also ask the doctor to review your inhaler technique, because using it correctly makes a big difference. In the meantime, try to stay well hydrated and avoid smoky environments. If the cough worsens or you develop a fever, please contact us straight away.`,
    q: [
      { type: 'MCQ', prompt: 'How long has Mr. Thompson had the cough?', options: { A: 'About two days', B: 'About two weeks', C: 'About two months', D: 'Since this morning' }, ans: 'B' },
      { type: 'TFNG', prompt: 'Mr. Thompson has a high fever.', ans: 'B' },
      { type: 'MCQ', prompt: 'When does the patient notice chest tightness?', options: { A: 'When lying down', B: 'When eating', C: 'When climbing the stairs', D: 'When talking' }, ans: 'C' },
      { type: 'MCQ', prompt: 'What does the nurse say she will ask the doctor to review?', options: { A: 'His diet', B: 'His inhaler technique', C: 'His blood pressure', D: 'His sleeping position' }, ans: 'B' },
      { type: 'TFNG', prompt: 'The nurse advises the patient to contact them if the cough worsens or he develops a fever.', ans: 'A' },
    ],
  },
  {
    set: 'oet_listen_A_002', voice: 'Puck',
    transcript: `Read the following as a healthcare professional giving a short briefing to nursing students about post-operative wound care. Today I'll outline the key principles of caring for a surgical wound after an operation. First, always perform hand hygiene and wear clean gloves before touching a wound or dressing. Observe the wound for signs of infection: increasing redness, swelling, warmth, unusual pain, or discharge that is cloudy or has an odour. A small amount of clear fluid in the first day or two is usually normal. When changing a dressing, work from the cleanest area outwards, and never re-use a swab on a clean part of the wound. Encourage the patient to eat a balanced diet with adequate protein, as good nutrition supports healing. Advise them to keep the dressing dry and to avoid touching the wound with unwashed hands. Finally, document everything you observe, including the size and appearance of the wound, and report any concerning changes to the senior nurse or doctor promptly.`,
    q: [
      { type: 'MCQ', prompt: 'What should be done before touching a wound or dressing?', options: { A: 'Take the patient’s temperature', B: 'Perform hand hygiene and wear clean gloves', C: 'Give pain medication', D: 'Remove all dressings at once' }, ans: 'B' },
      { type: 'TFNG', prompt: 'A small amount of clear fluid in the first day or two is described as usually normal.', ans: 'A' },
      { type: 'MCQ', prompt: 'When changing a dressing, you should work:', options: { A: 'From the dirtiest area inwards', B: 'From the cleanest area outwards', C: 'From the edges towards the centre', D: 'In any direction' }, ans: 'B' },
      { type: 'MCQ', prompt: 'Why is a balanced diet with adequate protein encouraged?', options: { A: 'To reduce appetite', B: 'To support wound healing', C: 'To lower blood pressure', D: 'To help the patient sleep' }, ans: 'B' },
      { type: 'TFNG', prompt: 'The briefing says concerning changes can be documented but do not need to be reported.', ans: 'B' },
    ],
  },
];

// ─── WRITING (2 referral-letter prompts: case notes + task) ───────────────────
const WRITING = [
  {
    set: 'oet_write_A_001',
    caseNotes: `Patient: Mrs. Ellen Carter, 78, female. Admitted: 12 days ago following a fall at home resulting in a fractured left hip. Surgery: left hip hemiarthroplasty (day 1 of admission), uncomplicated. Progress: mobilising short distances with a frame and physiotherapy; wound healing well, sutures removed. Medical history: osteoporosis, mild hypertension (well controlled on amlodipine), lives alone in a first-floor flat. Social: widowed, one daughter nearby who visits daily. Discharge plan: home today. Needs ongoing wound check, mobility support, and falls-prevention review. Medications on discharge: amlodipine 5 mg daily, calcium/vitamin D supplement, paracetamol as needed for pain.`,
    task: `Using the case notes, write a referral letter to Ms. Sarah Nolan, Community Nurse, requesting follow-up care for Mrs. Carter at home. In your answer, expand the relevant notes into full sentences; do not use note form.`,
  },
  {
    set: 'oet_write_A_002',
    caseNotes: `Patient: Mr. Raj Patel, 54, male. Seen in the diabetes clinic today. Diagnosis: type 2 diabetes, diagnosed 6 weeks ago. Recent HbA1c: 9.2% (elevated). Symptoms: increased thirst, tiredness, occasional blurred vision. Started on metformin 500 mg twice daily, tolerating well. Diet: reports frequent takeaway meals and sugary drinks; limited physical activity due to sedentary job. BMI 31 (obese range). Motivated to improve but unsure how. Plan: needs structured dietary and lifestyle support to improve glycaemic control and reduce cardiovascular risk. No known allergies.`,
    task: `Using the case notes, write a referral letter to Ms. Karen Bright, Community Dietitian, requesting dietary and lifestyle support for Mr. Patel. Expand the relevant notes into full sentences; do not use note form.`,
  },
];

// ─── SPEAKING (2 sets, 2 role-plays each; text role cards, no audio) ──────────
const SPEAKING = [
  {
    set: 'oet_speak_A_001',
    roleplays: [
      `ROLE-PLAY 1 — Setting: surgical ward. You are the nurse. Mr. Adams (patient) is scheduled for a minor operation this afternoon and is visibly anxious. Reassure him, explain in simple terms what will happen before the operation, and answer his concerns about the anaesthetic. Encourage him to ask questions.`,
      `ROLE-PLAY 2 — Setting: hospital ward, at discharge. You are the nurse. You are speaking to the daughter of an elderly patient who is going home with a new medication (a blood thinner). Explain when and how the medication should be taken, what to watch out for, and when to seek help. Confirm her understanding.`,
    ],
  },
  {
    set: 'oet_speak_A_002',
    roleplays: [
      `ROLE-PLAY 1 — Setting: outpatient clinic. You are the nurse. Mrs. Lopez has recently been diagnosed with high blood pressure. Discuss practical lifestyle changes (diet, activity, smoking) in a supportive, non-judgemental way, and agree one or two achievable goals with her.`,
      `ROLE-PLAY 2 — Setting: hospital ward. You are the nurse. The son of a seriously ill patient is upset and worried about his father's condition. Acknowledge his feelings, provide appropriate reassurance without giving false hope, and explain how he can stay informed and involved in his father's care.`,
    ],
  },
];

// ─── TTS one transcript → WAV in the frontend static audio dir ────────────────
async function ttsToWav(text: string, voice: string, outPath: string): Promise<void> {
  const key = process.env.GEMINI_API_KEY!;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${key}`;
  const body = { contents: [{ parts: [{ text }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } } };
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`TTS ${voice} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j: any = await res.json();
  const b64 = j?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!b64) throw new Error('TTS returned no audio');
  const pcm = Buffer.from(b64, 'base64');
  const rate = 24000, ch = 1, bps = 16, blockAlign = ch * bps / 8, byteRate = rate * blockAlign;
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(ch, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(byteRate, 28); h.writeUInt16LE(blockAlign, 32); h.writeUInt16LE(bps, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  fs.writeFileSync(outPath, Buffer.concat([h, pcm]));
}

(async () => {
  try {
    const DO_INSERT = process.env.DO_INSERT === '1';
    fs.mkdirSync(AUDIO_DIR, { recursive: true });

    // 1) TTS the two listening transcripts
    for (const set of LISTENING) {
      const out = path.join(AUDIO_DIR, `${set.set}.wav`);
      await ttsToWav(set.transcript, set.voice, out);
      console.log(`🔊 TTS → ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
    }

    // 2) Build rows
    type Row = any;
    const rows: Row[] = [];
    const optJson = (o: any) => (o ? o : null);
    // correct_answer is a plain VARCHAR the scorer compares case-insensitively (===).
    // Match the IELTS convention exactly: MCQ = bare letter (A/B/C/D); TFNG = T/F/NG
    // (NOT the option letter) with NO options object — the client renders its own
    // True/False/Not-Given control and submits T/F/NG.
    const TFNG_MAP: Record<string, string> = { A: 'T', B: 'F', C: 'NG' };
    for (const r of READING) r.q.forEach((q, i) => rows.push({
      skill: 'READING', question_type: q.type, set_id: r.set, sequence: i + 1,
      passage_text: r.passage, audio_url: null, prompt_text: q.prompt,
      options: q.type === 'TFNG' ? null : optJson((q as any).options),
      correct_answer: q.type === 'TFNG' ? (TFNG_MAP[q.ans] ?? q.ans) : q.ans, min_words: null,
    }));
    for (const l of LISTENING) l.q.forEach((q, i) => rows.push({
      skill: 'LISTENING', question_type: q.type, set_id: l.set, sequence: i + 1,
      passage_text: null, audio_url: `/diagnostics/audio/${l.set}.wav`, prompt_text: q.prompt,
      options: q.type === 'TFNG' ? null : optJson((q as any).options),
      correct_answer: q.type === 'TFNG' ? (TFNG_MAP[q.ans] ?? q.ans) : q.ans, min_words: null,
    }));
    for (const w of WRITING) rows.push({
      skill: 'WRITING', question_type: 'WRITING_PROMPT', set_id: w.set, sequence: 1,
      passage_text: w.caseNotes, audio_url: null, prompt_text: w.task, options: null, correct_answer: null, min_words: 180,
    });
    for (const s of SPEAKING) s.roleplays.forEach((rp, i) => rows.push({
      skill: 'SPEAKING', question_type: 'SPEAKING_PROMPT', set_id: s.set, sequence: i + 1,
      passage_text: null, audio_url: null, prompt_text: rp, options: { is_warmup: false, task_type: 'roleplay' }, correct_answer: null, min_words: null,
    }));

    console.log(`\nBuilt ${rows.length} rows:`);
    const bySkill: Record<string, number> = {};
    for (const r of rows) bySkill[r.skill] = (bySkill[r.skill] ?? 0) + 1;
    console.log(' ', Object.entries(bySkill).map(([k, v]) => `${k}:${v}`).join(' | '));

    // 3) Insert (guarded)
    const existing = await p.$queryRawUnsafe<any[]>(`SELECT count(*)::int n FROM diagnostic_questions WHERE exam_id='${EXAM}'`);
    if (existing[0].n > 0) { console.log(`\n⚠️ ${existing[0].n} oet_nursing diagnostic rows already exist — skipping insert (delete them first to re-seed).`); return; }
    if (!DO_INSERT) { console.log('\n(dry-run — set DO_INSERT=1 to write to DB)'); return; }

    await p.$transaction(rows.map((r) => p.$executeRawUnsafe(
      `INSERT INTO diagnostic_questions (skill, question_type, set_id, sequence, passage_text, audio_url, prompt_text, options, correct_answer, min_words, level, exam_id, is_active)
       VALUES ($1::"SkillType",$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,true)`,
      r.skill, r.question_type, r.set_id, r.sequence, r.passage_text, r.audio_url, r.prompt_text,
      r.options ? JSON.stringify(r.options) : null,
      r.correct_answer ?? null,
      r.min_words, LEVEL, EXAM,
    )));
    console.log(`\n✅ Inserted ${rows.length} OET diagnostic rows.`);
  } catch (e: any) { console.log('ERR', e.message); }
  finally { await p.$disconnect(); }
})();

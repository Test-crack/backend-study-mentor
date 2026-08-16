# Diagnostic Question Verification

Structural (Layer 1) + AI content judge (Layer 2) verification for a NEW BATCH
of diagnostic questions, before it's imported into the live
`diagnostic_questions` table.

Unlike drills, diagnostic questions are never staged as many independently
authored CSVs over time — they're read live from Postgres. This tooling exists
to check a batch BEFORE it goes in, not to police an ongoing import pipeline.
See `template.csv` in `question-banks/` for the exact format to write a batch in.

## Why this is separate from drills' tooling

Diagnostic questions have a different real shape than drills (confirmed
against the live table, not just the Prisma schema file):

- `question_type` has 4 values — `MCQ`, `TFNG` (True/False/Not Given, Reading
  only), `WRITING_PROMPT`, `SPEAKING_PROMPT` — and a Reading passage's question
  set legitimately MIXES MCQ and TFNG rows.
- `correct_answer` is a plain string (`"B"`, `"T"`), not drills' JSON-encoded
  string.
- Reading rows carry the full passage repeated on every row of their set;
  Listening rows carry an `audio_file` reference the same way.
- There's no `sub_skill` and no `explanation` column.
- Every set currently holds exactly 5 questions (Listening/Reading); Writing/
  Speaking sets hold exactly 1 prompt each.

## The difficulty bar

These questions must be genuinely **hard** — the diagnostic exists to
accurately place a student's true level. An easy diagnostic that everyone
does well on doesn't reveal anything real, so Layer 2 treats "too easy to
discriminate students" as a real defect, not just a style note.

## Content ownership

- **Reading, Writing, Speaking**: authored via this pipeline.
- **Listening**: authored separately (needs actual audio production — no
  TTS/audio-generation pipeline exists in this codebase). Every Listening
  batch MUST include the author's verbatim transcript alongside the audio —
  not reconstructed afterward — since Layer 2 grades MCQ answers against it
  and cross-checks it against the real audio file.

## Running it

```bash
npm run diagnostic:verify -- --file "./my-batch.csv"          # Layer 1 (structural, free, instant)
npm run diagnostic:judge  -- --file "./my-batch.csv"           # Layer 2 (AI, costs money)
npm run diagnostic:judge  -- --file "./my-batch.csv" --audio-dir "./staging-audio"   # + Listening audio cross-check
```

Layer 1 must pass clean before running Layer 2 — a structurally broken row
produces meaningless AI judgements. Both write a colored `.xlsx` report to
`results/` (gitignored, local only, same as drills' reports).

## Batch size

Current rollout: **10 questions per batch (2 sets of 5)** for Reading/Writing/
Speaking/Listening, replacing 2 of the existing tiered sets at a time, until
all 3 difficulty tiers (A/B/C, 30 questions total per skill) are replaced with
one unified hard pool. See the project's `diagnostic-difficulty-disconnect-plan`
notes for the full rollout sequencing.

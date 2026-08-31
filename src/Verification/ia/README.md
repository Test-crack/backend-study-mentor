# IA (Internal Assessment) question-bank verification

Tooling that takes IA question CSVs from the content author to `ia_questions`:
checks them, gives every question a permanent id, and imports them idempotently.
Structurally, this mirrors `Verification/drills/` — one CSV per bucket, tagged,
verified, judged, imported — but the row shape and Layer 2 judging logic are
ported from `Verification/diagnostic/`, because `IAQuestion` spans
MCQ/TFNG/WRITING_PROMPT/SPEAKING_PROMPT the way `DiagnosticQuestion` does, not
the flat 4-option MCQ that drills is.

```
Verification/
  ia/
    question-banks/
      drills/                        The real CSVs, by difficulty (git-ignored — local only)
        beginner/  intermediate/  advanced/
      shared/                        Types, CSV load/write, source_key logic
      layer1-verifier/               Structural checks + CLI entry point
        __fixtures__/                 Known-bad CSVs used as regression tests
      layer2-content-judge/          Blind solver, adjudicator, prompt-quality judge, cache
      key-assignment-tool/           Stamps source_key onto each question (reads the DB, read-only)
      importer/                      Upserts into ia_questions — the ONLY thing that writes
    results/
      layer1-verifier/
      layer2-content-judge/
      key-assignment-tool/
    cache/
```

## The bucket

Drills buckets on (skill, sub_skill, level); IA buckets on
**(skill, sub_skill, difficulty)** — `IAQuestion.difficulty` (`DifficultyType`:
BEGINNER/INTERMEDIATE/ADVANCED) plays the same role `level` plays for drills.
`source_key` follows the same convention with an `ia_` prefix instead of `drill_`:

```
ia_{skill}_{sub_skill}_{difficulty}_{###}

ia_listening_listening_beginner_001
ia_writing_task_response_advanced_014
```

## The CSV shape

```
skill, sub_skill, difficulty, question_type, passage_id, passage_text,
audio_url, prompt_text, options, correct_answer, explanation, exam_type
```

`question_type` is one of `MCQ | TFNG | WRITING_PROMPT | SPEAKING_PROMPT` (a
CSV-level contract this tool enforces — `IAQuestion.question_type` is a plain
varchar in Postgres, not a database enum). Which columns a row must fill in
depends on its `question_type`:

| question_type | options / correct_answer | passage_text / audio_url |
|---|---|---|
| `MCQ` | both required | READING: passage_text required; LISTENING: audio_url required |
| `TFNG` | correct_answer only (T/F/NG); options must be blank | same as MCQ |
| `WRITING_PROMPT` | both blank | both blank |
| `SPEAKING_PROMPT` | both blank | both blank |

`passage_id` groups rows that share one passage/recording — the same role
`set_id` plays for diagnostic batches — and every row sharing a `passage_id`
must carry the identical `passage_text` / `audio_url`.

## The order to run things

```
1. Content author writes/updates the raw 12-column CSV in question-banks/drills/<difficulty>/
2. npm run ia:verify                        structure, BEFORE tagging
3. npm run ia:assign-keys                   stamps source_key -> results/key-assignment-tool/<difficulty>/
4. npm run ia:verify -- --require-source-key --dir <that folder>
5. npm run ia:judge                         are the answers/prompts actually good
6. npm run ia:import -- --target dev        dry run, then --confirm, then run again
```

## Layer 1 — structural verifier

Same discipline as drills' Layer 1: no AI, no database, one colored `.xlsx`
report, exit codes `0` clean / `1` hard failure / `2` warnings / `3` usage
error. Bucket-consistency checks (uniform skill/sub_skill/difficulty across a
file, filename/folder cross-checks, cross-file duplicate detection) are ported
from drills' `checks.ts`. Question-type-conditional row checks and
passage/audio consistency (grouped by `passage_id`) are ported from
diagnostic's `checks.ts`.

## Layer 2 — content judge

Two judging paths, both ported from diagnostic's `judge.ts`:

- **MCQ / TFNG** — blind-solve, compare, adjudicate only on disagreement.
  Outcomes: `AGREE`, `UPHELD`, `ANSWER_WRONG`, `QUESTION_DEFECTIVE`,
  `QUESTION_DEGENERATE`, `TOO_EASY`, `UNJUDGED`, `SKIPPED`. `TOO_EASY` is a
  real outcome — IA questions are used for graded assessment, so a question
  everyone gets right for free tells the assessment nothing.
- **WRITING_PROMPT / SPEAKING_PROMPT** — there is no stored answer to
  blind-solve against, so the model judges the prompt itself: is it clear,
  unambiguous, and genuinely hard? `SPEAKING_PROMPT` gets the identical
  judgement `WRITING_PROMPT` gets — no transcript exists at authoring time,
  only once a real student answers live later.

**Listening deviation from diagnostic:** `IAQuestion` has no author-submitted
`transcript` column, only `audio_url` (the hosted final URL). So the
Listening cross-check here transcribes the audio for a human to read, but
cannot automatically diff it against a submitted script the way diagnostic's
`AudioCrossCheck` can — see `layer2-content-judge/types.ts`.

## Key-assignment tool

Identical mechanics to drills': reads the DB (read-only) plus any
already-tagged local files, matches by normalized prompt text so a
resubmitted batch reuses existing keys, allocates new numbers only for
genuinely new questions, and reports (never deactivates) any previously-keyed
question missing from a resubmitted batch.

## Importer

Upserts on `source_key` into `ia_questions`. Dry run unless `--confirm`; a
real write also requires `--layer2-reviewed`. Reuses `Import/target.ts`
unchanged (target resolution is table-agnostic); does not reuse
`Import/importer.ts`, which is drills-specific (imports `DrillCsvRow`, writes
`drill_type`) — see `question-banks/importer/importer.ts`'s header comment.
`is_active` is never overwritten by an update, so re-importing a CSV cannot
resurrect a deliberately retired question.

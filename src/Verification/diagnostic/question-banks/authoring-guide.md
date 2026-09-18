# Diagnostic Question Authoring Guide (Reading / Writing / Speaking)

Read this file before writing a new batch. It exists so the difficulty bar and
structural requirements don't have to be re-derived (or re-explained) every
time — read it, then author directly into the staging CSV format described in
`template.csv`. No AI API call is used to generate content — this is authored
directly, then checked by Layer 1 (structural) and Layer 2 (AI content judge)
after the fact, same as content from any other author.

## The non-negotiable difficulty bar

These questions must be genuinely **hard** — the diagnostic exists to
accurately place a student's true skill level. A question answerable from
general knowledge, common sense, or a direct one-to-one paraphrase of a single
passage sentence fails this bar even if it's technically well-formed and has
a correct answer. Layer 2 explicitly checks for this (`TOO_EASY`), and two
questions were rewritten for exactly this reason while building the first
Reading batch — see "Common failure: the paraphrase trap" below.

## Reading

- **Passage**: ~400-450 words, original (never copied from a real source),
  dense non-fiction — academic, scientific, historical, economic. Should read
  like something genuinely written for educated adults, not simplified.
- **5 questions per set**, mixing MCQ (4 options) and TFNG (True/False/Not
  Given) — real Reading sets legitimately mix both within one passage.
- **Every answer must be strictly text-grounded** — answerable from the
  passage alone, no outside knowledge required, and no genuine ambiguity.

### Common failure: the paraphrase trap

A question that just restates one passage sentence with synonyms swapped in
is too easy — a student can pattern-match the wording without understanding
anything. Every question should instead require **synthesis**: connecting two
separate statements in the passage, understanding a qualification or negation
("does not eliminate entirely" vs. "eliminates"), or drawing the single
correct inference the passage supports while ruling out plausible-sounding
distractors that misstate a nearby detail.

Concrete example of the failure and the fix (from the first Reading batch):

- **Too easy**: "Switch costs are typically larger when two tasks draw on
  overlapping cognitive resources than when they do not." — this is close to
  a direct lift of one sentence.
- **Fixed, requires synthesis**: "Extensive practice with a specific pair of
  tasks removes the switch-cost penalty that arises when those tasks draw on
  overlapping cognitive resources." (False) — now the student must combine
  the overlapping-resources point with a *separate* sentence about practice
  reducing-but-not-eliminating switch costs, and catch the negation.

### MCQ distractor discipline

Wrong options should be *plausible* — each one should misstate a real detail
from the passage (a number, a causal direction, a scope), not be obviously
absurd. A distractor nobody would pick isn't really a distractor.

## Writing

- One IELTS Task 2-style discursive prompt (agree/disagree, discuss-both-
  views, problem/solution) per set (1 row).
- Pick a genuinely two-sided issue — nothing with an obvious "correct" side,
  since real argumentative skill only gets tested on a question worth arguing
  about.
- `min_words: 250` (Task 2 convention — confirmed live: `min_words >= 250`
  is exactly what distinguishes Task 2 from Task 1 in this schema).

## Speaking

- One open-ended prompt per set (1 row) requiring genuine personal reflection
  and extended reasoning — not answerable in one or two sentences.
- Avoid prompts with a trivially short "correct" answer (e.g. "what's your
  favorite color") — the prompt should require the student to structure and
  sustain a real spoken response.

## Batch mechanics (all skills)

- Staging CSV columns: exactly `template.csv`'s 12 columns.
- `level`: use `B` as a placeholder in the staging CSV — the import step
  preserves whatever `level` the *target* existing set already has in the DB,
  regardless of what's in the CSV, so this value is never actually written.
- `set_id` in the staging CSV can be any working label (e.g. `RD_BATCH1_01`)
  — the importer's `--set-id` flag decides the real target set independently,
  so the staging CSV's own set_id only matters for Layer 1/2's internal
  grouping, not for where the content actually lands.
- Batch size: 2 sets (10 questions) at a time for Reading/Listening, 10
  individual prompts at a time for Writing/Speaking.

## After authoring, always

1. `npm run diagnostic:verify -- --file <path> --expected <n>` — must be
   CLEAN before proceeding.
2. `npm run diagnostic:judge -- --file <path> --clear-cache` — must be
   CLEAN (no `TOO_EASY`, `ANSWER_WRONG`, `QUESTION_DEFECTIVE`,
   `QUESTION_DEGENERATE`, or unresolved `UNJUDGED`/`SKIPPED` rows). Read the
   cache file's `detail` field for any flagged row and revise rather than
   re-running blindly — a flagged question usually needs a genuine rewrite,
   not a lucky re-roll.

# How to read the question-bank check reports

For whoever writes and fixes the drill questions. No technical background needed.

Two automated checks run over the question CSVs, and each produces one Excel file.

| Check | What it asks | What it can tell you |
|---|---|---|
| **Layer 1** | Is the file *built* correctly? | Broken columns, invalid answer format, duplicate questions, wrong filename, duplicate options |
| **Layer 2** | Is the answer *actually right*? | Wrong answer keys, explanations that contradict the answer, questions with two valid answers |

Layer 1 never looks at whether a question makes sense. Layer 2 never looks at
formatting. You need both.

---

## The colours — the only thing you really must know

| Colour | Meaning | What to do |
|---|---|---|
| 🟩 **Green** | Passed every check | Nothing |
| 🟨 **Amber** | Needs a human to look | Read it and decide |
| 🟥 **Red** | Confirmed problem | Must fix before this goes live |
| ⬜ **Grey** *(Layer 2 only)* | **Not checked at all** | Not a pass — it was skipped or the check failed |

**Grey is the one people misread.** Grey does not mean "fine". It means the check
never happened for that row, so nobody knows yet.

---

## Both reports have the same shape

**Open the file and you'll see tabs along the bottom:**

- **`Summary`** — always the first tab. Start here.
- **One tab per CSV file** — named after the bucket, e.g. `04 SPEAKING-FLUENCY-BEGINNER`.

### The Summary tab

Tells you, in one screen, which files are fine and which need work. One row per
CSV, colour-coded, with counts. Read across to see how many questions passed and
how many didn't, then click the matching tab for detail.

Layer 2's Summary also has a small legend explaining each verdict — handy to keep
open the first few times.

### The detail tabs

The top few rows tell you which file it is and how it did overall.

Then a dark blue header row, and below it **one row per question**, coloured by
result. The header row stays visible as you scroll, and has filter arrows — click
one to show only the red rows and hide everything that passed. That's the fastest
way to work through a file.

Two columns help you find the question in the original CSV:

- **`Row #`** — the question's position (1st, 2nd, 3rd question in the file)
- **`CSV Line`** — **the actual line number in the CSV file.** This is the one you
  want. Open the CSV, jump to that line, fix it there.

---

## Reading a Layer 1 tab

Above the question rows you may see a **"File-level findings"** block. These are
problems with the file *as a whole*, not with one question — a broken header row,
the wrong number of questions, a filename that disagrees with its contents. Fix
these first; some of them stop the rest of the file from being checked properly.

Then per question:

| Column | What it's for |
|---|---|
| **Outcome** | PASS / WARN / FAIL |
| **Codes** | Short machine name for the problem, e.g. `PROMPT_DUPLICATE` |
| **Reason** | Plain-English explanation of what's wrong. **Read this one.** |
| skill, sub_skill, level, prompt_text, options, correct_answer, explanation | The question exactly as it is in the CSV |

The **Reason** column is written to be self-explanatory and usually tells you
exactly what to change. For example:

> *prompt_text appears 3 times in this file (lines 2, 36, 62); this row duplicates
> line(s) 36, 62.*

Common Layer 1 problems and what they mean:

- **`CORRECT_ANSWER_NOT_JSON`** — the answer is written `A` when it must be `"A"`
  with quote marks. Add the quotes.
- **`PROMPT_DUPLICATE`** — the same question appears more than once in the file.
  Delete or rewrite the copies.
- **`OPTION_TEXT_DUPLICATE`** — two of the four options say the same thing, so the
  question can't be answered properly.
- **`OPTIONS_NOT_JSON`** — usually a quote mark inside an option that breaks the
  formatting, e.g. `Replace "passed" with "had passed"`.
- **`BUCKET_FILENAME_MISMATCH`** — the questions inside don't match what the
  filename claims. Either the file is named wrong, or it holds the wrong content.
- **`ROW_COUNT_MISMATCH`** — the file has more or fewer questions than expected.
  Often means rows were dropped or pasted twice.
- **`EMBEDDED_HEADER_ROW`** — the column-titles row got copied into the middle of
  the file as if it were a question. Delete that line.

---

## Reading a Layer 2 tab

This is the more interesting one. For every question, the system **answered the
question itself, without being shown your answer key**, then compared.

| Column | What it's for |
|---|---|
| **Verdict** | The result — see the table below |
| **Stored** | The letter *your CSV* says is correct |
| **Model** | The letter the checker chose on its own |
| **Conf.** | How confident it was (high / medium / low) |
| **What it means** | Plain-English summary. **Read this one.** |
| **Model reasoning** | Why it picked that answer |
| **Adjudicator reasoning** | Filled in only when there was a disagreement to settle |
| prompt_text, options, explanation | The question as it is in the CSV |

### The verdicts

- 🟩 **`AGREE`** — it picked the same answer as you. Nothing to do.

- 🟥 **`EXPLANATION_WRONG`** — **the most common one, and the most misunderstood.**
  Your answer is **right**. The *explanation text* is what's wrong — it names a
  different option than the correct one. For example the key says the answer is A,
  but the explanation reads *"only option C does this cleanly."*
  **→ Do not change the answer. Only fix the explanation sentence.**

- 🟥 **`ANSWER_WRONG`** — the answer key itself is wrong. The "What it means"
  column names the letter that should be correct.

- 🟥 **`QUESTION_DEFECTIVE`** — the question has more than one defensible answer,
  or none. The question needs rewriting, not just relabelling.

- 🟨 **`UPHELD`** — the checker disagreed at first but decided your key was right
  after all. Usually nothing to do, but worth a quick read; these are the
  borderline questions. A `medium` or `low` confidence here often means the
  question is harder or vaguer than intended.

- ⬜ **`UNJUDGED`** — the check couldn't run (connection problem). **Not a pass.**
  Re-run it.

- ⬜ **`SKIPPED`** — the row was too broken to even ask about. Fix it in Layer 1
  first, then Layer 2 can check it.

---

## Suggested working order

1. **Open Layer 1's Summary.** Any file with red? Start there.
2. **Fix file-level findings first** (the block above the questions). A broken
   header can hide everything else.
3. **Filter the question rows to red** and work down using the `CSV Line` numbers.
4. **Re-run Layer 1** until it's clean.
5. **Then open Layer 2's Summary.** Content problems only make sense once the
   formatting is sound.
6. **In Layer 2, treat `EXPLANATION_WRONG` as an editing job, not an answer job** —
   the answers are already confirmed correct.
7. **Re-run Layer 2.** Re-runs are almost free: anything you didn't change is
   remembered from last time, so only your edits get re-checked.

---

## Things worth knowing

**The explanation is shown to students.** It appears next to the answer, labelled
something like "Why option B is correct". So an explanation naming the wrong
letter is visible, contradictory content — not an internal note.

**There is only one explanation per question.** It should explain why the correct
answer is correct. If the app appears to show a reason for a *wrong* option too,
that text is generated automatically and isn't something you write.

**Nothing you see in these reports has changed your files.** Both checks only
read the CSVs and write the Excel report. Every fix is made by a person, in the
CSV.

**A green file is not necessarily a finished file.** These checks catch structural
faults and wrong answers. They don't judge whether a question is well-pitched for
its level, interesting, or in house style. That's still your call.

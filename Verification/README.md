# Verification

Tooling that takes drill-question CSVs from the content author to the database:
checks them, gives every question a permanent id, and imports them idempotently.

```
Verification/
  question-banks/
    drills/                        The real CSVs, by level (git-ignored — local only)
      beginner/  intermediate/  advanced/
    shared/                        Types, CSV load/write, source_key logic — used by everything
    layer1-verifier/               Structural checks + CLI entry point
      __fixtures__/                 Known-bad CSVs used as regression tests for Layer 1
    layer2-content-judge/          Blind solver, adjudicator, cache handling + CLI entry point
    key-assignment-tool/           Stamps source_key onto each question (reads the DB, read-only)
    importer/                      Upserts into drill_questions — the ONLY thing that writes
  results/
    layer1-verifier/               Colored Excel reports from the structural Verifier (Layer 1)
    layer2-content-judge/          Colored Excel reports from the AI Content Judge (Layer 2)
    key-assignment-tool/           TAGGED CSVs, by level — real data, not a report
  cache/                           Layer 2's per-question cache, so re-runs don't re-pay for unchanged rows
```

- **Layer 1 (Verifier)** — no AI, no database connection. Checks CSV shape: headers,
  enum values, filename-vs-content bucket match, duplicate questions, JSON encoding,
  and (with `--require-source-key`) that every question carries a valid unique id.
- **Layer 2 (Content Judge)** — checks whether the *answers* are actually correct,
  using a blind-solve-then-adjudicate pattern. Only runs on files that already
  passed Layer 1. Ignores `source_key` entirely.
- **Key-assignment tool** — assigns each question a permanent `source_key`. Reads the
  database to see which ids are already issued, but only ever SELECTs.
- **Importer** — the only component that writes. Upserts on `source_key`; dry run
  unless `--confirm`.

## The order to run things

```
1. Jincy writes / updates the raw 7-column CSV in question-banks/drills/<level>/
2. npm run drills:verify                     structure, BEFORE tagging
3. npm run drills:assign-keys                stamps source_key -> results/key-assignment-tool/<level>/
4. npm run drills:verify -- --require-source-key --dir <that folder>
                                             confirms the tagging itself is clean
5. npm run drills:judge                      are the answers actually right
6. npm run drills:import                     dry run, then --confirm, then run again
```

Step 2 exists so a structurally broken file is never tagged — a file whose rows are
mislabeled would otherwise get ids under the wrong bucket. Step 4 is not redundant with
step 2: step 2 checks the author's content, step 4 checks the tool's output.

## Where the CSVs go

```
question-banks/drills/
  beginner/  intermediate/  advanced/
```

Drop each batch's CSVs into the folder for its level. **These files are
git-ignored** — the question bank stays local. Only the `__fixtures__` CSVs are
committed, because those are regression tests.

The folder is not just storage. Layer 1 reads the level back off the path and
checks it against what the rows say, so a batch dropped in the wrong folder gets
caught (`LEVEL_FOLDER_MISMATCH`) — the same trick as the filename check, and the
same reason: the worst bug in the real data was internally consistent and only
fell out of comparing rows against outside metadata.

## Running Layer 1

```bash
npm run drills:verify
```

That scans every level folder. To narrow it down, or to point somewhere else:

```bash
npm run drills:verify -- --level beginner
```

```bash
npm run drills:verify -- --level advanced --expected 50
```

```bash
npm run drills:verify:test
```

Pick **one** way to choose files — `--level <name>`, `--dir <path>`, or
`--file <path>` (repeatable) / plain positional paths. Passing more than one is a
usage error, because it would be unclear which files actually got checked.
`--match <text>` filters by case-insensitive substring of the filename. `--dir`
and `--level` both recurse into subfolders. `--out <path>` overrides where the
report lands.

`--expected <n>` is the rows-per-file each batch should have (default 200). Since
Advanced batches are legitimately smaller, it also takes per-level overrides so a
single run can cover every folder:

```bash
npm run drills:verify -- --expected "advanced=50,else=200"
```

There is no `--confirm`-style flag and never should be: Layer 1 reads CSVs and
writes one `.xlsx`. It opens no database connection and modifies no input.

Every run writes a colored workbook to `results/layer1-verifier/` — a Summary
sheet plus one sheet per input CSV, with each question row filled green (clean),
amber (needs human review) or red (blocks import) and a column giving the
specific reason.

### Exit codes

| Code | Meaning |
|---|---|
| 0 | every file passed clean |
| 1 | at least one hard failure — **do not import** |
| 2 | no failures, but warnings need human review first |
| 3 | usage error, no files matched, or the verifier crashed |

Codes 2 and 3 are non-zero on purpose, so `verify && import` cannot run an import
on an unreviewed batch — or on a run where a `--match` typo quietly matched
nothing.

## Running Layer 2 (Content Judge)

Layer 1 asks whether a file is *shaped* right. Layer 2 asks the only question left
that matters: **is the stored answer actually the correct one?**

```bash
npm run drills:judge -- --level beginner --limit 20
```

```bash
npm run drills:judge -- --level beginner
```

```bash
npm run drills:judge:test
```

It reads the **same CSVs in `drills/`** that Layer 1 and the importer read — there
is no intermediate file. Uses `GEMINI_API_KEY` and `gemini-2.5-flash`.

### How it decides

1. **Blind solve.** The model answers the question seeing *only* the prompt and the
   four options — never the answer key, never the explanation. Shown the intended
   answer, a model will justify whatever it is given, so agreement would mean
   nothing. An independent attempt is the only step here that carries information.
2. **Compare.** If the blind answer matches the key, that is one call and done.
3. **Adjudicate**, only where they differ. Now the model sees everything and
   referees: is the key right, is the blind solve right, or is the *question*
   defective — ambiguous, several right answers, or none?

| Verdict | Colour | Meaning |
|---|---|---|
| `AGREE` | green | Answer independently confirmed |
| `UPHELD` | amber | Solve disagreed, but on review the key holds up |
| `EXPLANATION_WRONG` | red | Answer is right; the explanation contradicts it |
| `ANSWER_WRONG` | red | The key is wrong |
| `QUESTION_DEFECTIVE` | red | Ambiguous, or several / no correct answers |
| `UNJUDGED` | grey | Model unreachable — **not checked, not a pass** |
| `SKIPPED` | grey | Row too malformed to ask about — **not checked, not a pass** |

Grey exists because the easiest way for a tool like this to lie is to let a failed
API call fall quietly into the "no problems found" pile.

### Gating is per row, not per file

Only a genuinely unreadable file (broken header) is skipped wholesale. A file that
failed Layer 1 for having 199 rows instead of 200 still gets judged — a row count
says nothing about whether answers are correct. Individual rows whose `options`
won't parse are marked `SKIPPED`; a row whose *answer key* is malformed is still
judged, because telling you what the answer should have been is exactly the useful
part.

### Options

`--level` / `--dir` / `--file` select files the same way Layer 1 does. `--limit <n>`
judges only the first N rows per file — use it to trial a run before paying for
thousands. `--votes <n>` runs N independent blind solves and requires a majority.
`--dry-run` lists what would be judged and makes no calls. `--concurrency <n>`
(default 6) caps parallel calls. `--no-cache` re-judges everything; `--clear-cache`
empties the cache and exits.

### Cache

Keyed by a hash of the question, options, answer, explanation, model name, prompt
template version, and vote count. Edit one row and only that row re-judges; change
nothing and a re-run costs zero calls. The template version is in the key on
purpose — without it, editing a prompt would silently keep serving verdicts
produced by the previous one. `UNJUDGED` is never cached, so an outage can't freeze
into a permanent non-answer.

### Where reports land

Both layers name a report after what it covers and file it under the level it
came from, with the timestamp demoted to a suffix:

```
results/
  layer1-verifier/
    beginner/       all--20260802-200206.xlsx
    intermediate/   speaking-vocabulary--20260802-200210.xlsx
    all-levels--20260802-200208.xlsx
  layer2-content-judge/
    beginner/       speaking-fluency--20260802-200205.xlsx
```

A single-file run is named for its skill and sub-skill; a whole-level run is
`all`; a run spanning levels stays at the top as `all-levels`. Because the
descriptor comes first, sorting by name groups every report for one bucket
together in date order — which is what you want when checking whether yesterday's
fixes landed.

The descriptor is derived from the file's **path**, not its row content. A
mislabeled file would otherwise produce a report named after the wrong bucket,
inheriting the exact bug the report exists to tell you about.

Still one workbook per run rather than one per CSV: a ten-file run should be one
file to open, and Layer 1's cross-file findings (two files claiming the same
bucket) belong to no single CSV.

### Exit codes

| Code | Meaning |
|---|---|
| 0 | every question judged, every answer confirmed |
| 1 | confirmed content defects — wrong answers, broken questions, bad explanations |
| 2 | disagreements upheld, and/or rows that could not be judged |
| 3 | usage error, no files matched, missing API key, or a crash |

### Which checks block, and which only warn

Everything structural is a hard failure. The one advisory check is
`EXPLANATION_CREDITS_OTHER_LETTER`, which flags an explanation that appears to
credit a different letter than `correct_answer`. It is a regex guessing at
authorial intent — a broader version of it produced ~54 false positives in ~3,000
production rows, because good explanations routinely name the *wrong* option to
explain why it is wrong. It stays a warning. Judging whether an answer is
actually correct is Layer 2's job.

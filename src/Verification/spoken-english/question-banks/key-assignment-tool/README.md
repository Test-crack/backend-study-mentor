# Key-assignment tool (`source_key`)

Stamps a permanent identifier onto every drill question, so the importer can tell
"I have seen this question before" from "this is new" — which is what makes
re-running an import safe instead of duplicating rows.

Reads the CSVs the content author wrote. Writes tagged copies elsewhere. **Never
modifies the input, never connects to the database, never calls an AI.**

```
question-banks/drills/<level>/            ← author's files, 7 columns, untouched
        │
        ▼   npm run se:drills:assign-keys -- --level <level>
results/key-assignment-tool/<level>/      ← tagged copies, 8 columns
        │
        ▼   npm run se:drills:verify -- --require-source-key --dir <that folder>
        ▼   npm run se:drills:judge
        ▼   importer
```

## What a key looks like

```
drill_{skill}_{sub_skill}_{level}_{###}

drill_listening_listening_beginner_001
drill_writing_task_response_beginner_042
drill_speaking_pronunciation_advanced_007
```

The enum member, lowercased. `TASK_RESPONSE` keeps its underscore, so keys do not
have a fixed number of `_`-separated segments — parsing matches whole prefixes
instead of splitting. There are exactly 30 legal prefixes, one per valid
(skill, sub_skill, level) combination.

The bucket is encoded in the key, so a key that has drifted onto a row from a
different file is detectable by inspection — Layer 1 reports it as
`SOURCE_KEY_BUCKET_MISMATCH`.

> ### The convention is the DATABASE's, not the docs'
>
> The task brief and `prisma/seeds/README.md` both specify an **abbreviated** form:
> `drill_listen_listen_beg_001`. **The live `drill_questions` table does not use it.**
> All 3,180 existing rows use the full-word form above — and the README's own backfill
> SQL example disagrees with the README's own table.
>
> The data won, because these are different strings: keys that don't match live rows
> cause the importer to INSERT duplicates instead of UPDATING. The abbreviated form is
> explicitly rejected by `parseSourceKey`, and a test asserts that, so the decision
> cannot be quietly reverted. If Sarthak ever wants the abbreviated form, the 3,180
> live rows have to be rekeyed first — it is not a change to this tool alone.

## Commands

```bash
npm run se:drills:assign-keys -- --level beginner --dry-run
```

```bash
npm run se:drills:assign-keys -- --level beginner
```

```bash
npm run se:drills:assign-keys -- --file "path/to/one.csv"
```

`--dry-run` prints the identical summary and writes nothing. `--out <dir>` moves the
output base. `--match <text>` filters by filename substring. `--dir <path>` scans an
arbitrary folder.

## It reads the database (read-only), by default

`drill_questions` already holds 3,180 keyed rows from an earlier ad-hoc seeding
process. The database — not the tagged-output folder — is the authority on which keys
have been issued, so the tool SELECTs from it before allocating anything.

Skipping that would be actively dangerous: a bucket whose `..._001` already belongs
to a live question would get `..._001` handed to a brand-new question, and the
importer, upserting on `source_key`, would write the new content **over** the live
row. Silent overwrite, no error. Hence reading is the default and `--no-db` is the
opt-out, not the reverse.

Per bucket it takes two things from the database:

- **the highest issued number**, so new keys continue past live rows;
- **prompt text → existing key**, so a question already live is recognised and keeps
  its key (an UPDATE) instead of being issued a second one (a duplicate INSERT).

Locally tagged files are layered on top, so keys already queued for import but not
yet applied are also not reused.

`--no-db` exists for offline work and prints a warning. It also reports, per bucket,
any live rows that have **no** key and any keys that don't parse — both mean the
numbering baseline may be incomplete, and both exit 2.

### Measured against the real beginner bank

```
Totals: 910 assigned, 1089 reused, 0 kept
```

1,089 of Jincy's 1,999 beginner questions turned out to already be live in dev, so
they keep their existing keys and will be updated in place. 910 are genuinely new and
were numbered past the live maximum. Verified directly against the database: **0 of
the 1,999 tagged keys point at a different question than the one already live under
that key.**

| Exit code | Meaning |
|---|---|
| 0 | every row tagged, nothing needing review |
| 2 | tagged, but a human needs to look — dropped keys, or rows too broken to tag |
| 3 | usage error, no files matched, or a crash |

## The rule it follows

**A key is allocated once and then lives in the file.** It is never recomputed from
a row's position.

That is the whole design, and the reason is worth keeping in mind before changing
anything here: if a key meant "the 3rd row of this bucket", then deleting one row
would shift every later row up a number, and the next import would upsert each of
them onto the *previous* row's database record. Content would be silently
overwritten with no error and no crash. Position is therefore never an identity.

Decision order per row:

1. Row already carries a valid key for this bucket → **keep it**, untouched.
2. Its prompt text was tagged before → **reuse** that key.
3. Otherwise → **allocate** the next free number for the bucket.

## Cases it handles

**A second batch for a bucket continues the numbering.** If the author writes 200
`SPEAKING/PRONUNCIATION/BEGINNER` questions, then another 200 later, the second
batch is numbered from 201 — not restarted at 001. The tool scans every already
tagged file for that bucket, not just the file in front of it. Restarting would
collide in the database, and the second batch's first question would overwrite the
first batch's first question.

**A resubmitted batch keeps its keys.** Authors often fix two questions by
re-exporting the whole batch. That incoming file has no keys at all, so a naive tool
would tag all 200 as new and duplicate 198 questions. Instead, questions are matched
by prompt text against what was tagged before, so unchanged questions keep their
original keys and only genuinely new text gets a new number.

**Deleting a row leaves a gap, and that is fine.** Keys are labels, not a sequence.
Nothing is renumbered, so no other question's identity moves. The removed question's
key is reported as dropped.

**A second batch continues past LIVE rows too, not just tagged files.** The numbering
baseline is the maximum of what the database has issued and what local tagged files
have claimed.

**Re-running is a no-op.** Running twice over the same input produces a
byte-identical file. Verified on the real beginner bank: second run reported
`0 assigned, 1999 reused`, and the output hashed identically.

**Typography does not create false differences.** Curly vs straight apostrophes and
collapsed whitespace are folded before comparing, using the same normalization
Layer 1 uses for duplicate detection — so a question that has been through a word
processor is still recognised as the same question.

## Limitation worth knowing

Matching is on exact (typography-folded) prompt text. A **reworded** question reads
as new: it gets a new key, and its old key is reported as dropped.

This is deliberate. There is no reliable way to tell "reworded question 12" from
"brand new question" by text alone, and guessing wrong would mean upserting new
content onto an unrelated question — worse than the alternative. So for a wording
fix, edit the already-tagged file in `results/key-assignment-tool/<level>/` directly:
the key stays attached to the row, and the importer updates that row in place.

## Dropped keys

When previously-tagged questions do not appear in a batch, the tool lists them by
key and exits 2. It does **not** deactivate or delete anything — those rows may
already be live in the database, and retiring a question is a content decision. The
list is there so someone decides deliberately rather than by omission.

## Tests

```bash
npm run se:drills:assign-keys:test
```

29 tests, none of which need a database — `assignKeys.ts` is pure and the database
reader is exercised through plain row objects. The four that matter most are the ones
a naive implementation gets wrong
silently rather than loudly: second-batch numbering, resubmission reuse, deletion
without renumbering, and re-run stability. The CSV writer is tested by writing a
row containing commas, quotes and an embedded newline, then re-parsing it with
`csv-parse` and asserting every cell survives byte for byte — quoting is the thing
most likely to be subtly wrong in a hand-rolled writer, and the `options` column is
JSON, so it always contains quotes.

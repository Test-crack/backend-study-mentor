# Importer

Writes verified, tagged drill questions into `drill_questions`. **The only thing in
this pipeline that writes to the database.**

Upserts on `source_key`, so running it twice cannot create duplicates.

```bash
npm run drills:import -- --target dev --level beginner
```

```bash
npm run drills:import -- --target dev --level beginner --confirm --layer2-reviewed
```

Input is the **tagged** output of the key-assignment tool
(`results/key-assignment-tool/<level>/`). The raw CSVs in `question-banks/drills/`
have no `source_key` and cannot be imported — `--level` resolves to the tagged folder
and says so if it is missing.

| Exit code | Meaning |
|---|---|
| 0 | dry run clean with nothing pending, or writes applied with no errors |
| 1 | a gate blocked a file, a row was unconvertible, or a write failed |
| 2 | dry run completed and changes are pending |
| 3 | usage error, no files matched, or a crash |

## Update behaviour: OVERWRITE (the documented choice)

When a `source_key` already exists and the incoming content differs, **the CSV wins**.

This is deliberate, and it is the choice the brief asks to be made explicitly. The
reason is the normal workflow: the content author fixes a wrong explanation, and
re-importing is how that fix reaches the database. Skip-and-flag would mean
corrections silently never land.

Consequences worth knowing before `--confirm`:

- The dry run lists **every** row that would change and **which fields** differ. Read
  that list. A row reported as `explanation` differing means the database's current
  explanation is about to be replaced by the CSV's.
- **`is_active` is never overwritten.** It is set to `true` on insert and left alone on
  update, so a question someone deliberately retired is not resurrected by a re-import.
- `updated_at` is set on update. `created_at` is left as it was.
- `drill_type` is always written as `MCQ` — it is not read from the CSV (there is no
  such column) and all 3,180 live rows are MCQ.

Nothing is ever deleted or deactivated. Questions that exist in the database but not
in the batch are left completely alone; the key-assignment tool reports them, and
retiring one is a human decision.

## Safety model

**Dry run is the default.** Writing requires `--confirm`. This matches every other
DB-touching script in the repo.

**`--target dev|prod` is required, and verified.** There is no default, because a
default is what gets forgotten on the run that mattered. More importantly, naming a
target is not the same as being connected to it: the connection goes through an SSH
tunnel on `localhost:5433`, and the port says nothing about which database is on the
far end. So the database **name** in the resolved URL must match the name expected for
the target, or the run is refused before anything is read or written:

```
Usage error: REFUSING TO RUN — the connection does not point at the target you named.
  --target prod expects the database "testcrack_db_main".
  DATABASE_URL actually points at "testcrack_db_dev"  (postgresql://***@localhost:5433/…)
  Nothing was read or written.
```

Resolution order: `--database-url`, then `DATABASE_URL_DEV` / `DATABASE_URL_PROD`,
then `DATABASE_URL`. All of them are name-checked — an explicit override is a reason
to be more careful, not less. Credentials are redacted everywhere they are printed.

**Layer 1 runs inline as a hard gate**, with `--require-source-key`. It is free and
deterministic, so there is no reason to trust a stale report file instead of just
re-checking. A file with any failing finding is skipped whole, and the failing codes
are named. `--no-gate` exists for diagnosis and is unsafe.

**Layer 2 cannot be re-run for free**, so a real write requires `--layer2-reviewed` —
an explicit assertion by the operator that the content report was read. The tool
cannot verify this; making it a required flag at least makes it a conscious step
rather than an assumption.

**Re-validation before every write.** `toImportRow` re-checks enums, the option shape,
the answer, and that the `source_key` agrees with the row's own bucket — even though
Layer 1 just checked all of it. This is the last code before a write; a silent
disagreement between the two would be much more expensive to debug than a duplicated
check is to maintain.

**A `source_key` used twice in one batch is an error, not a merge.** Both rows would
upsert onto the same database row, the later winning, and one question would vanish
with no error anywhere.

## Enum casing

CSV cells are canonicalised, never copied through. Real batches disagree
(`Task response`, `TASK_RESPONSE`, `task_response` have all appeared) and the Postgres
enum accepts exactly one spelling, so the raw cell would fail at the driver for a
difference that carries no meaning. `correct_answer` is unwrapped from the CSV's JSON
text (`"B"`) to a plain string and stored in the Json column, which is exactly how all
3,180 existing rows are stored.

## The required process (from the brief)

```bash
npm run drills:import -- --target dev --level beginner
```
Review the output — specifically the per-row `~ field` lines.

```bash
npm run drills:import -- --target dev --level beginner --confirm --layer2-reviewed
```

```bash
npm run drills:import -- --target dev --level beginner --confirm --layer2-reviewed
```
Run it **again, immediately**. It must report `0 inserted, 0 updated` and every row as
unchanged. That is the idempotency proof, and it is a required step, not optional.

Then: smoke test on dev, get sign-off, confirm a fresh backup of `testcrack_db_main`,
and repeat the whole sequence with `--target prod` — including the second run, because
the dev result does not prove anything about prod.

## Row counts

The Layer 1 gate checks row count against `--expected` (default 200), same grammar as
Layer 1 itself: a number, or `advanced=50,else=200`.

`SPEAKING · FLUENCY` (beginner) genuinely has 199 rows, so a whole-level run blocks it
with `ROW_COUNT_MISMATCH` until someone decides whether a row is missing. To import it
once that is settled, run it alone:

```bash
npm run drills:import -- --target dev --expected 199 --file "…/SPEAKING · FLUENCY.csv"
```

That is the gate working, not a bug — a short file usually means a truncated export.

## Tests

```bash
npm run drills:import:test
```

24 tests, no database required: `importer.ts` is pure, and the target resolver takes an
env object rather than reading `process.env`. The cases carrying the most weight are
the ones where a plausible implementation writes something wrong instead of failing —
enum casing copied verbatim, a re-run reporting "updated" for rows it did not change
(which would defeat the idempotency proof), two rows sharing a key, and `--target dev`
being accepted while connected to prod.

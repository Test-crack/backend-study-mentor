# Loadout Engine

A config-driven Layer 1. One engine reads a **loadout** — a JSON description of
an exam's CSV — instead of a hand-written pipeline per exam.

Status: **proven, not yet adopted.** The four hand-written IELTS pipelines are
still the ones doing real work. This is a parallel path.

---

## Why

Adding an exam meant forking the pipeline. There are five near-identical copies
under `src/Verification/` (`drills`, `diagnostic`, `ia`, `spoken-english`,
`mock`), ~12–14 files each. Building Mock was largely `sed`-renaming IA's files.

A loadout moves the parts that are just *data* — columns, allowed values,
required fields, key format — out of code. Adding an exam becomes authoring a
rulebook, and for straightforward exams an admin can do it in the panel with no
backend work at all.

## What it does and doesn't cover

| | Status |
|---|---|
| Layer 1 (structural checks) | Done — parity with all four IELTS pipelines |
| Layer 2 (AI content judge) | Not started |
| Key assignment | Not started |
| Importer (DB writes) | Not started |

The engine **never writes to the question database.**

---

## Layout

```
src/Verification/loadout-engine/
  loadout/
    schema.ts              the Loadout type + validateLoadout
    draft.ts               expands a panel-authored draft into a Loadout
    load.ts                reads a loadout off disk
    ielts-drills.json      ┐
    ielts-mock.json        │ the four reference loadouts, pinned by
    ielts-ia.json          │ the parity suite — read-only in the panel
    ielts-diagnostic.json  ┘
  engine/
    findings.ts            finding codes + severities (the vocabulary)
    csvLoad.ts             generic CSV loader
    checks.ts              the declarative checks
    hooks.ts               checks that need real logic
    sourceKey.ts           key grammar
    verify.ts              orchestration
    excelReport.ts         .xlsx report
  parity/
    compareFork.ts         shared parity comparison
    compare*.ts            one entry point per fork
    parity.spec.ts         the test suite
    __fixtures__/          extra test CSVs (mock, ia, diagnostic)

data/loadouts/             admin-authored loadouts (gitignored, runtime data)
src/controllers/loadoutController.ts
src/routes/loadoutRoutes.ts
```

Frontend: `ai-study-mentor/src/features/TestCrackSuperAdmin/dashboard/LoadoutVerification.tsx`

---

## The panel

**Superadmin → Loadout Engine** (`/superadmin/loadouts`)

- Pick a loadout to see exactly what it checks
- **+ New** to build one: name it, add columns, pick a type per column, save
- Upload CSVs, set expected rows, **Run Layer 1**
- Colour-coded result banner + per-file findings + **Excel report** download

Column types in the builder:

| Type | Checks |
|---|---|
| Free text | Anything; optionally must not be blank |
| One of a list | Must match one of the values you list |
| Whole number | An integer, optionally within min/max |
| Answer options (A/B/C/D) | JSON object, all keys present, none blank, no repeats |
| Correct answer | Must be one of the values you list |

**Only applies when…** limits a column to rows where another column has a given
value. On rows that don't match, the column is skipped *and* must be blank.

The four reference loadouts can't be edited in the panel — the parity suite
pins them.

---

## Loadout schema

Full reference is `loadout/schema.ts`. The parts that matter:

- **`columns[]`** — ordered; this *is* the expected CSV header. Each declares a
  kind, its finding codes, and optionally `appliesWhen` / `forbiddenWhen` /
  `variants` (when one column is validated differently per row type).
- **`bucket`** — columns every row in one file must agree on. Optional;
  Diagnostic has none.
- **`sourceKey`** — permanent row ids. Optional; Diagnostic issues none. Segments
  need not be bucket dimensions (Mock's key encodes `question_type`).
- **`checkOrder`** — which check groups run in what order. Declared because the
  forks genuinely disagree, and finding order is part of what parity compares.
- **`hooks[]`** — named code hooks (below).

`validateLoadout` runs at load and rejects a loadout referencing an undeclared
column, so a typo fails loudly rather than silently skipping a check.

## Hooks

Some checks aren't per-column rules. A loadout **names** a hook; it cannot
define one — that keeps arbitrary logic out of JSON and inside code review.

| Hook | What |
|---|---|
| `promptRowShape` | Prompt rows raise one finding for options OR answer, not one each |
| `promptRowNoPassageAudio` | Prompt rows carry no passage or audio |
| `mockGrounding` | Mock: READING groups on `passage_id`, LISTENING on `audio_url`, standalone rows valid |
| `iaPassageGroups` | IA: every MCQ/TFNG row needs a `passage_id`; consistency depends on skill |
| `diagnosticSets` | Diagnostic: sets agree on skill/level, sequence runs 1..n |

Adding a hook means editing `engine/hooks.ts` — i.e. a developer.

---

## Parity

The engine is only trustworthy if it reproduces the pipelines it would replace.

```bash
npm run loadout:parity:test        # all four, as a test suite
npm run loadout:parity             # drills, CLI
npm run loadout:parity:mock
npm run loadout:parity:ia
npm run loadout:parity:diagnostic
```

**Bar:** structural parity — codes, severities, scopes, lines, columns, ordering,
buckets, outcomes. Drills additionally reaches byte-identical message parity.

Message parity is *not* required for the other three: the forks word identical
codes differently ("options is empty." vs "options is empty, but question_type is
MCQ.") with no principled reason. Matching that would spec an accident.

Each fork also has a **"not vacuous"** test that feeds in a deliberately broken
loadout and asserts the diff catches it. A harness never seen to fail proves
nothing.

Current: **18/18 passing.**

---

## API

All routes are SUPERADMIN-only, under `/api/superadmin/loadouts`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/` | List loadouts + known hooks |
| GET | `/:id` | One loadout: summary, raw, `editable`, its draft |
| POST | `/verify` | Run Layer 1. `loadoutId`, `expected?`, `requireSourceKey?` + `files[]` |
| POST | `/verify/report` | Same run as a colour-coded `.xlsx` |
| POST | `/preview` | Validate a draft without saving |
| POST | `/` | Create from a draft |
| PUT | `/:id` | Update |
| DELETE | `/:id` | Delete |

Reference loadout ids are refused for write operations.

---

## What was learned

Building the four loadouts in order surfaced the real answer to "does this
generalize":

- **Drills** — the engine can reproduce a real pipeline exactly, prose included.
- **Mock** — forced four new concepts: row-kind dispatch, conditional columns, a
  row-scoped allow-list, and a declared check order. Also caught a real bug: the
  findings table was missing Mock's codes, so nine hard failures resolved to
  `severity: undefined` and silently passed.
- **IA** — needed *zero* schema changes. First sign the schema described a family
  rather than one shape. Its prompt-row rules turned out identical to Mock's, so
  that hook is now shared.
- **Diagnostic** — the outlier. Made `bucket` and `sourceKey` optional, added a
  `number` column kind and a `set` finding scope. Caught two more real bugs: with
  no bucket every file collided on the empty string, and `loose_enum` accepted
  quoted answers where Diagnostic's plain-varchar column requires bare ones.

**Limits.** Grouping logic, cross-column rules and set validation still need a
developer. A straightforward exam is fully self-serve; those specific patterns
are not.

## Next

1. Spoken English — the fifth and last fork
2. Layer 2 criteria as editable data (mechanics were identical across all forks;
   only the criteria prose varied)
3. Move loadouts from disk to the database
4. Only then consider retiring a hand-written fork

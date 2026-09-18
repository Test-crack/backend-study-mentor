# Verification pipeline — CLI commands

All commands run from the **repo root**. This covers the three tools that run
*before* the importer — see [Import/CLI_COMMANDS.md](../Import/CLI_COMMANDS.md) for
the importer itself. Pipeline order:

```
question-banks/drills/<level>/                 ← author's raw CSVs
        │
        ▼   npm run drills:assign-keys -- --level <level>
results/key-assignment-tool/<level>/           ← tagged copies (adds source_key)
        │
        ▼   npm run drills:verify -- --require-source-key --dir <that folder>
results/layer1-verifier/<level>/               ← structural check report
        │
        ▼   npm run drills:judge -- --dir <that folder>
results/layer2-content-judge/<level>/          ← content-quality check report
        │
        ▼   npm run drills:import -- --target dev --level <level>
```

---

## 1. Key-assignment tool (`source_key`)

Stamps a permanent identifier onto every question so the importer can tell "seen
before" from "new." Read-only against the CSVs; database access is read-only too
(SELECTs existing keys, never writes). Full detail: [key-assignment-tool/README.md](question-banks/key-assignment-tool/README.md).

```bash
npm run drills:assign-keys -- --level beginner --dry-run
npm run drills:assign-keys -- --level beginner
```

| Flag | Meaning |
|---|---|
| `--level <name>` | Tag one level folder: `beginner \| intermediate \| advanced`. |
| `--dir <path>` | Directory of `.csv` files to tag, including subfolders. |
| `--match <text>` | Only files whose name contains this text. |
| `-f, --file <path>` | A CSV to tag; repeat for multiple files. |
| `--out <path>` | Output base directory (default: `Verification/results/key-assignment-tool`). |
| `--dry-run` | Report what would be assigned without writing any file. |
| `--no-db` | Offline mode — skips the read-only DB lookup (prints a warning; use only when the DB genuinely isn't reachable). |

**Tests:**
```bash
npm run drills:assign-keys:test
```

---

## 2. Layer 1 — structural verifier

Deterministic, free, no AI calls. Checks shape/enum/encoding correctness of the
tagged CSVs.

```bash
npm run drills:verify -- --level beginner
npm run drills:verify -- --level beginner --require-source-key
```

| Flag | Meaning |
|---|---|
| `--level <name>` | Check one level folder: `beginner \| intermediate \| advanced`. |
| `--dir <path>` | Directory to scan for `.csv` files, including subfolders. |
| `--match <text>` | Only files whose name contains this text. |
| `-f, --file <path>` | A CSV to check; repeat for multiple files. |
| `--out <path>` | Report file or directory (default: `Verification/results/layer1-verifier`). |
| `-q, --quiet` | Summary only — skip the per-file and per-finding detail. |

**Tests:**
```bash
npm run drills:verify:test
```

**Full typecheck of the Verification tree:**
```bash
npm run drills:verify:typecheck
```

---

## 3. Layer 2 — content-quality judge (AI-graded)

Calls Gemini to blind-solve each question and flag content issues (ambiguous
prompts, wrong keys, etc.). Not free — has a cache so re-runs don't re-judge
unchanged rows.

```bash
npm run drills:judge -- --level beginner --dry-run
npm run drills:judge -- --level beginner
```

| Flag | Meaning |
|---|---|
| `--level <name>` | Judge one level folder: `beginner \| intermediate \| advanced`. |
| `--dir <path>` | Directory to scan for `.csv` files, including subfolders. |
| `--match <text>` | Only files whose name contains this text. |
| `-f, --file <path>` | A CSV to judge; repeat for multiple files. |
| `--votes <n>` | Independent blind solves per question (default 1). |
| `--limit <n>` | Judge at most N rows per file — cheap trial runs. |
| `--concurrency <n>` | Parallel model calls. |
| `--model <name>` | Gemini model to use. |
| `--out <path>` | Report file or directory. |
| `--no-cache` | Ignore the cache and re-judge every row. |
| `--clear-cache` | Delete all cached judgements, then exit. |
| `--dry-run` | List what would be judged and stop before any model call. |
| `-q, --quiet` | Summary only. |

**Tests:**
```bash
npm run drills:judge:test
```

---

## Run everything

```bash
npm test
```
Runs all four test suites (layer1, layer2, key-assignment-tool, importer) in sequence.

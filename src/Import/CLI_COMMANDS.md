# Importer — CLI commands

All commands run from the **repo root**. Full rationale, safety model, and required
process are in [README.md](README.md) — this file is just the command reference.

## Run (dry run by default — writes nothing)

```bash
npm run drills:import -- --target dev --level beginner
```

## Write for real

Requires `--confirm` (writes) and `--layer2-reviewed` (an explicit assertion that the
Layer 2 content report was read):

```bash
npm run drills:import -- --target dev --level beginner --confirm --layer2-reviewed
```

## Options

| Flag | Meaning |
|---|---|
| `--target <dev\|prod>` | **Required.** Which database to write to; verified against the resolved connection's actual database name. |
| `--database-url <url>` | Explicit connection string (still name-checked against `--target`). |
| `--level <name>` | Import the tagged files for one level. |
| `--dir <path>` | Import every `.csv` in this directory. |
| `-f, --file <path>` | A CSV to import; repeat for multiple. |
| `--match <text>` | Only files whose name contains this text. |
| `--expected <n>` | Row-count gate (default 200; grammar: a number, or `advanced=50,else=200`). |
| `--confirm` | Actually write. Without this, nothing is committed. |
| `--layer2-reviewed` | Required alongside `--confirm` — asserts the content report was read. |
| `--no-gate` | Skip the inline Layer 1 gate. Unsafe; diagnosis only. |

## Target by database, not the tunnel port

`--target` is name-checked against the actual database in the resolved connection — not
just trusted, since the tunnel's port says nothing about which DB is on the far end:

```bash
npm run drills:import -- --target dev --expected 199 --file "…/SPEAKING · FLUENCY.csv"
```

## Tests (24 tests, no database required)

```bash
npm run drills:import:test
```

## Required process (from the brief)

```bash
# 1. Dry run — review the per-row `~ field` diffs
npm run drills:import -- --target dev --level beginner

# 2. Write for real
npm run drills:import -- --target dev --level beginner --confirm --layer2-reviewed

# 3. Run again immediately — must report 0 inserted, 0 updated, everything unchanged
#    (this is the idempotency proof, not optional)
npm run drills:import -- --target dev --level beginner --confirm --layer2-reviewed

# 4. Smoke test on dev, get sign-off, confirm a fresh prod backup, then repeat the
#    whole sequence (including the second run) with --target prod
```

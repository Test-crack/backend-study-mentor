# Platform vision — what TestCrack *is*

> The one idea every feature is measured against. If a change can't be explained as
> "reads the exam's config / seeds the exam's banks," it's probably hardcoding an exam —
> stop and reconsider.

## The core idea

**TestCrack is an exam-agnostic assessment platform.** One engine runs every exam —
IELTS, Spoken English, OET, and any future exam — through the same pipeline:
**diagnostics → daily drills → IA → mock**.

**An exam is *data*, not code.** Adding an exam means supplying data, not writing engine
code:

| Building block | What it is | Where it lives |
|---|---|---|
| **Config** | components, score scale, scoring strategy, sub-skills, `delivery` type | versioned config → `validateConfig` → `exams` + `exam_configs` |
| **Registry entry** | the exam is known + selectable | exam registry / config load on boot |
| **Question banks** | diagnostic · drills · IA · mock content (+ TTS where needed) | seeded via the verify → import pipeline |

The aim: **a superadmin onboards a new exam with no/low code** — author config, register,
seed banks — and the whole student journey works.

## The no-code boundary

- **Pure config / data (no code):** any exam that **reuses an existing scoring strategy**
  (`band_mean`, `cefr_hybrid`, `per_component`) **+ an existing grader** (MCQ-accuracy,
  essay-AI, speaking-AI, viva). This is the target for every new exam.
- **Low-code (dev, once):** a genuinely **novel scoring or grading mechanism** must be
  registered in the strategy/grader registry a single time. After that it's config again.

## What this means for every change

Every feature — new or migrated — must:

1. **Read the exam's config** (`getExamConfig(examId)` / the exam-config projection on the
   frontend), **never branch on a hardcoded exam id.**
2. **Degrade safely** when config isn't loaded yet (the frontend fallback only knows
   `ielts` — gate on `useExamConfigReady`).
3. **Never regress the exams already live** (IELTS, Spoken English). New behaviour goes
   behind config so the shipped path is untouched by construction.

A useful PR test: *"Does this read config, or did it just special-case an exam?"*

## Safety model for live exams (why config authoring is safe)

Because real users have real scored results, the authoring system is built so power is
confined to zero-risk places:

- **Built-in exams (IELTS/SE/OET) stay file-locked**; the dashboard only authors **new**
  (DB) exams — you can't edit a shipped exam by construction.
- **Configs are versioned + immutable; results are provenance-pinned** (engine + config
  version stamped) so old scores keep their meaning.
- **Draft → validate → dry-run → publish** — never direct-to-live. Structural/scoring
  changes are blocked on any exam that already has scored users.

## Roadmap

The staged plan to reach full superadmin-configurability (config authoring keystone →
diagnostics → drills → IA → mock → the rest) is tracked in the maintainer's project notes,
not here — this doc is the *principle*, the roadmap is the *sequence*.

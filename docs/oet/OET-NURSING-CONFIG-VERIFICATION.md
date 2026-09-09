# OET-Nursing — Config Verification (our config vs real OET)

**Purpose:** verify what our `exam-engine-config.v2.json` declares for `oet_nursing` against the real,
published OET exam before we build. Checked against OET's own materials + multiple prep sources
(Sept 2026). See Sources.

## Verdict at a glance

| Area | Our config | Real OET | Status |
|---|---|---|---|
| Sub-tests (L/R/W/S) | 4 | 4 | ✅ match |
| Timing | L40 / R60 / W45 / S20 min | L~40 / R60 / W~45 / S~20 min | ✅ match |
| Sub-test parts | tagged A/B/C etc. | A/B/C etc. | ✅ match |
| Scale | `oet_500` (0–500, 10-pt steps) | 0–500, 10-pt steps | ✅ match |
| Grade bands A–E | A450 / B350 / C+300 / C200 / D100 / E0 | identical | ✅ match |
| Overall grade | `per_component` (none) | *"OET does not issue an overall grade"* | ✅ match |
| NMC nursing target | L350 R350 **W300** S350 | B in L/R/S, C+ in W = same numbers | ✅ match |
| **Subskills / criteria** | **empty (`[]`, TODO)** | **OET-specific analytic criteria** | ❌ **must define — NOT IELTS's** |

**Bottom line:** the config author got the structure/scoring exactly right and *correctly left the
subskills blank*. The one real decision is the **assessment criteria** — and OET's are its own, not
IELTS's.

---

## 1. Structure & timing — ✅ verified

| Sub-test | Real OET | Our config | Notes |
|---|---|---|---|
| **Listening** | ~40 min, **3 parts (A/B/C), 42 questions**. A = consultation extracts, B = short workplace extracts, C = presentation/interview. Shared across professions. | 40 min; item_tags `consultation_extract, short_workplace_extract, presentation_interview`; `variant_scoped:false` | ✅ |
| **Reading** | 60 min. **Part A = expeditious reading (15 min)**, **Parts B+C = careful reading (45 min)**. Shared across professions. | 60 min; item_tags `expeditious_reading, careful_reading_short, careful_reading_long`; `variant_scoped:false` | ✅ |
| **Writing** | ~45 min (5 read + 40 write), **1 letter task**, ~180–200 words, **profession-specific**. Nursing = usually a referral letter. | 45 min; item_tags `referral_letter, transfer_letter, discharge_letter, advice_letter`; `variant_scoped:true` | ✅ |
| **Speaking** | ~20 min, **2 role-plays**, profession-specific (nurse–patient/carer). | 20 min; `delivery:"roleplay"`; item_tags `role_play`; `variant_scoped:true` | ✅ (config doesn't fix the count at 2 — fine) |

L/R identical for all professions; W/S nursing-specific. ✅ matches config's variant model.

## 2. Scoring & grades — ✅ verified (exact)

- **0–500 per sub-test**, reported in **ten-point increments**, letter grade **A–E**, **no overall
  score**. ✅ = our `oet_500` + `overall.mode:"per_component"`.
- **Grade bands** (real → our config, identical):

| Grade | Real OET | Our `oet_500.grade_bands` |
|---|---|---|
| A | 450–500 | 450–500 ✅ |
| B | 350–440 | 350–440 ✅ |
| C+ | 300–340 | 300–340 ✅ |
| C | 200–290 | 200–290 ✅ |
| D | 100–190 | 100–190 ✅ |
| E | 0–90 | 0–90 ✅ |

## 3. Regulator target (NMC — UK nursing) — ✅ verified

- NMC requires **Grade B (≥350) in Listening, Reading, Speaking** and **Grade C+ (≥300) in Writing**.
  Combined sittings allowed within 12 months, no sub-test more than half a grade below.
- Our `oet_nursing.target.presets.nmc` = `{ listening:350, reading:350, writing:300, speaking:350 }` → ✅ exact.

---

## 4. Subskills / assessment criteria — ❌ the real decision

Our config has empty `subskills` for W & S with `_subskill_todo: "do not invent"`. **OET's real
criteria are published and are NOT IELTS's.** Here they are:

### Writing — 6 criteria (total 38 raw marks → mapped to 0–500)
| Criterion | Max | What it measures |
|---|---|---|
| **Purpose** | 0–3 | Is the reason for writing clear, immediate, and sustained |
| **Content** | 0–7 | Relevance/accuracy/prioritisation of case-note info (not quantity) |
| **Conciseness & Clarity** | 0–7 | Clear, concise clinical communication; no padding |
| **Genre & Style** | 0–7 | Reads like professional clinical correspondence to this reader |
| **Organisation & Layout** | 0–7 | One topic per paragraph, smooth transitions, letter conventions |
| **Language** | 0–7 | Grammar, vocab range, spelling, punctuation |

> vs IELTS Writing (`task_response, coherence_cohesion, lexical_resource, grammatical_range_accuracy`)
> — **different criteria and different weights** (Purpose is 0–3, the rest 0–7).

### Speaking — two criteria groups
**Linguistic (4, each 0–6):**
| Criterion | Measures |
|---|---|
| **Intelligibility** | Pronunciation, intonation, accent → clarity |
| **Fluency** | Speed/smoothness → understanding |
| **Appropriateness of Language** | Register, tone, professionalism, patient comfort |
| **Resources of Grammar & Expression** | Grammatical accuracy + vocabulary range |

**Clinical Communication (5, each 0–3):**
| Criterion | Measures |
|---|---|
| **Relationship building** | Opening, empathy, respect |
| **Understanding the patient's perspective** | How fully the patient is involved |
| **Providing structure** | Logical sequencing/signposting of the consultation |
| **Information gathering** | Questioning, listening, clarifying |
| **Information giving** | Explaining clearly, checking understanding |

> vs IELTS Speaking (`fluency_coherence, lexical_resource, grammatical_range_accuracy, pronunciation`)
> — **only Fluency/Grammar overlap**; OET adds Intelligibility, Appropriateness, and the **5 clinical
> communication criteria**, which are the whole point of a healthcare exam.

### ⚠️ Decision (revises checklist **D1**)
"Reuse IELTS subskills" is **factually wrong for OET.** Options:

- **A — Adopt OET's real criteria** (recommended for authenticity): Writing = the 6 above; Speaking =
  4 linguistic + 5 clinical. *Cost:* the 5 clinical-communication criteria need a healthcare-aware
  grader prompt (harder for the LLM than pure language scoring), and Writing has mixed weights
  (0–3 vs 0–7). This is what makes it credible OET prep.
- **B — Linguistic-only MVP for the diagnostic**: score Writing's 6 + Speaking's **4 linguistic**
  criteria now; add the **5 clinical** criteria in a later pass. Honest, shippable, still OET-shaped.
- **C — IELTS-like placeholder** (not recommended): quick but misrepresents OET; a knowledgeable
  nursing candidate will notice the criteria are wrong.

**My recommendation: B for the diagnostic slice, on a path to A** — implement the true OET criteria
IDs now (so storage/config are correct forever) but grade the 4 linguistic + 6 writing criteria
first, and layer the 5 clinical-communication criteria in when we build the speaking grader properly.

---

## 5. Content authenticity note
All seeded OET content must be **original** (written to the format), never copied from real OET
papers — CBLA's IP terms are strict (see `legal._risk_note` in the config).

## Sources
- OET test format / timing — [OET-Bank format guide](https://oet_nursing-bank.com/exam-format-guide/), [Yocket OET pattern](https://yocket.com/blog/oet_nursing-exam-pattern), [Shiksha OET pattern](https://www.shiksha.com/studyabroad/exams/oet_nursing/pattern)
- Writing criteria (6) — [OET Live: how writing is scored](https://oetlive.com/blog/how-oet_nursing-writing-is-actually-scored/), [WCS writing criteria](https://oetwritingcorrection.com/oet_nursing-writing-criteria), [Benchmark criteria explained](https://edubenchmark.com/blog/oet_nursing-assessment-criteria-explained/)
- Speaking criteria (4 linguistic + 5 clinical) — [OET official: assessment criteria](https://oet_nursing.com/post/study-skills-assessment-criteria), [OET official: speaking criteria overview](https://oet_nursing.com/en-us/post/speaking-criteria-overview)
- Scoring 0–500 / grades / NMC — [OET Live: band scores explained](https://oetlive.com/help/oet_nursing-band-scores-explained/), [OET: NMC English requirements](https://oet_nursing.com/post/nmc-changes-english-language-requirements), [Tijus NMC OET requirements 2026](https://tijusacademy.com/blogs/oet_nursing/uk-nmc-oet_nursing-requirements-for-nurses-2026/)

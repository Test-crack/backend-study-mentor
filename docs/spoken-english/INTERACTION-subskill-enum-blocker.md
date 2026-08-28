# Spoken English — `interaction` subskill blocked on a DB migration

## TL;DR

24 drill questions for the `interaction` subskill are written, structurally verified,
and AI-content-verified — but they cannot be imported. The Postgres enum
`SubSkillType` doesn't have an `INTERACTION` value yet. **Ask: add `INTERACTION` to
the `SubSkillType` enum** (migration, not a code change) so these can go live.

---

## Current state

Drill content for Spoken English (`exam_id='spoken_english'`) is fully built:
144 MCQ questions across 6 subskills × CEFR levels a1/a2/b1/b2, verified through the
same two-layer pipeline IELTS content uses (structural checks + AI blind-solve).

- **120 questions already imported to dev**, confirmed live in `drill_questions`.
- **24 questions (the `interaction` subskill) are staged but not imported** — every
  attempt fails at the database layer:

  ```
  Invalid value for argument `sub_skill`. Expected SubSkillType.
  ```

This isn't a content bug. It's Postgres rejecting the literal value `INTERACTION`
because that enum member doesn't exist.

## Why this exists

Per the content-data-requirement doc (§7.1), Spoken English's 6 CEFR subskills were
mapped onto the *existing* `SubSkillType` enum wherever a reasonable equivalent
existed, specifically to avoid a migration:

| CEFR subskill | DB enum value used |
|---|---|
| range | `VOCABULARY` |
| accuracy | `GRAMMAR` |
| fluency | `FLUENCY` |
| coherence | `COHERENCE` |
| phonology | `PRONUNCIATION` |
| **interaction** | **no equivalent exists** |

The current enum is:

```
enum SubSkillType {
  LISTENING
  READING
  GRAMMAR
  VOCABULARY
  COHERENCE
  TASK_RESPONSE
  FLUENCY
  PRONUNCIATION
}
```

`interaction` (appropriate/responsive replies) has no IELTS-era value that fits —
`TASK_RESPONSE` is the closest neighbor semantically, but reusing it would blur two
genuinely different things without an explicit decision to do so. The verification
pipeline was deliberately built to target the correct end state (`INTERACTION` as its
own value) rather than silently overload `TASK_RESPONSE`, so it fails loudly instead
of quietly mislabeling content.

## What's needed

A migration adding one value to the enum:

```sql
ALTER TYPE "SubSkillType" ADD VALUE 'INTERACTION';
```

(Exact syntax/process per however this team runs Postgres enum migrations — flagging
the change, not prescribing the mechanism.)

## What happens after the migration lands

Nothing else needs to change. The 24 `interaction` questions are already written,
tagged, and passed both verification layers. Re-running the existing import command
per CEFR level will pick them up with zero other changes:

```bash
npm run se:drills:import -- --target dev --level a1 --confirm --layer2-reviewed
npm run se:drills:import -- --target dev --level a2 --confirm --layer2-reviewed
npm run se:drills:import -- --target dev --level b1 --confirm --layer2-reviewed
npm run se:drills:import -- --target dev --level b2 --confirm --layer2-reviewed
```

Expect: 6 more inserted per level (24 total), 0 changes to anything already imported.

## Also worth knowing (separate, lower-priority issue)

Independent of this blocker: `getNextActionDrill` (the "what drill should this
student do next" recommendation engine, in `src/controllers/drillController.ts`)
currently hardcodes IELTS's 4 speaking subskills and an `examWeaknessGap('ielts', ...)`
call regardless of the student's actual exam. Even once all 144 Spoken English
questions are live, a Spoken English student's drill recommendations won't reflect
the real CEFR-6 subskill model until this function is made exam-aware. Not blocking
today's ask, just flagging so it doesn't surprise anyone later.

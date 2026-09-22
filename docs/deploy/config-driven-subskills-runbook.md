# Deploy runbook — config-driven `sub_skill` (OET real-criteria drills)

Branch: `feat/config-driven-subskills` (backend `c9579c4`). **Frontend needs no change** — the
drill focus queue already consumes the recommender's `focus_queue` (string sub-skills) and humanises
them, so it renders OET's criteria automatically.

This is a **coupled** change: the schema (enum→text), the code (config-driven recommender, de-cast),
and the reseed must all land in **one window**. The `SubSkillType` enum TYPE is retained (IA + the
verification pipeline still use it) — only the two drill columns become text.

## Preconditions
- DB tunnel to `dev_db` up (`localhost:5433`).
- `GEMINI_API_KEY` set (the reseed generates ~450 MCQs).
- Backend deploy is a push to `dev` (CI). `prisma db push` is **not** used — the column change is the
  hand-run SQL below.

## Steps (in order, one window)
1. **Migration — columns to text** (old deployed code still works: it casts `::"SubSkillType"`, and
   `text = enum` comparisons still resolve for the existing enum values):
   ```
   psql "$DATABASE_URL" -f prisma/seeds/drill_subskill_to_text.sql
   ```
2. **Deploy the code** — merge/push `feat/config-driven-subskills` → `dev`. The config-driven
   recommender + de-cast queries now serve. (Run `npx prisma generate` in CI/build as usual.)
3. **Reseed OET drills** — replace the generic Writing/Speaking drills with criterion drills
   (Listening/Reading are untouched):
   ```
   DO_INSERT=1 npx tsx prisma/seeds/oet_nursing_criterion_drills.mts
   ```
   Deletes the old generic OET W/S rows, inserts Writing 6 + Speaking 9 criteria × 3 levels × 10.

Between steps, OET drills briefly fall back to the shared IELTS bank (never 404) — an acceptable
short window.

## Verify
- OET student → drill focus queue shows **criteria** (Purpose, Genre & Style, Relationship Building…),
  not the generic Grammar/Vocabulary set.
- `startDrillSession` for an OET criterion serves OET criterion drills.
- **IELTS + SE drills unchanged** (their recommender path + enum-valued drills are untouched).

## Rollback
- Revert the code deploy. The text column is backward-compatible with the old code **for enum values**
  — but after the reseed, OET rows hold non-enum criterion ids, so to fully roll back also restore the
  generic OET W/S drills (re-run the previous `oet_nursing_drills.mts`) or delete the criterion rows.
- Do **not** ALTER the column back to the enum unless every value is an enum member.

## Known cosmetic follow-up
Criterion labels render from the uppercased id (`GENRE_STYLE` → "Genre Style"), losing the config
label's "&" ("Genre & Style"). Optional polish: include the config `label` in `focus_queue`.

# Question Bank Seeds

All seed files are JSON arrays consumed by `prisma/seed.ts`.
Run with: `npm run seed` (safe to run multiple times — fully idempotent).

## Source key convention

Every question must have a `source_key` — a stable, human-assigned identifier that never changes.

| Table | Format | Example |
|---|---|---|
| `drill_questions` | `drill_{skill}_{sub_skill}_{level}_{###}` | `drill_listen_listen_beg_001` |
| `ia_questions` | `ia_{skill}_{sub_skill}_{difficulty}_{###}` | `ia_write_grammar_beg_001` |
| `mockquestions` | `mock_{skill}_{sub_skill}_{type}_{###}` | `mock_write_grammar_mcq_001` |
| `lexigrid_words` | uses `(base_word, target_word)` natural key | no source_key needed |

Skill abbreviations: `listen`, `read`, `write`, `speak`  
Sub-skill abbreviations: `listen`, `read`, `grammar`, `vocab`, `coherence`, `taskresponse`, `fluency`, `pronun`  
Level/difficulty: `beg`, `int`, `adv`  
Type: `mcq`, `tfng`, `wprompt`, `sprompt`

## Migrating existing SQL seed files

`docs/data-seeding/drill-questions-insert.sql` contains ~90 LISTENING/BEGINNER MCQ questions
as raw INSERTs without source_keys. Before these can be managed by this runner:

1. Export the current rows from the DB (if already inserted):
   ```sql
   SELECT id, prompt_text FROM drill_questions
   WHERE skill = 'LISTENING' AND sub_skill = 'LISTENING' AND level = 'BEGINNER'
   ORDER BY created_at;
   ```

2. Generate source_keys:
   ```sql
   -- Back-fill source_keys for existing rows (run once):
   UPDATE drill_questions
   SET source_key = 'drill_listen_listen_beg_' || LPAD(ROW_NUMBER() OVER (ORDER BY created_at)::text, 3, '0')
   WHERE skill = 'LISTENING' AND sub_skill = 'LISTENING' AND level = 'BEGINNER'
     AND source_key IS NULL;
   ```

3. Export to JSON and replace the INSERT SQL with entries in `drill_questions.json`.

4. The old `.sql` file in `docs/data-seeding/` should then be deleted or clearly marked as archived.

## Files

| File | Table | Status |
|---|---|---|
| `drill_questions.json` | `drill_questions` | Template — needs full 600-question dataset |
| `ia_questions.json` | `ia_questions` | Template — needs full 300-question dataset |
| `mock_questions.json` | `mockquestions` | Template — needs full mock bank |
| `lexigrid_words.json` | `lexigrid_words` | Partial — needs 75 word pairs total |

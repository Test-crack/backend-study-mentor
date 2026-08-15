# Diagnostic Question Verification

Structural + AI-content verification for the live `diagnostic_questions` table (reads directly from Postgres — diagnostic questions aren't staged as CSVs like drills are). Layer 1 (structural) and Layer 2 (AI content judge) to be built here, mirroring ../drills/question-banks/ in spirit but adapted for a DB-backed source of truth.


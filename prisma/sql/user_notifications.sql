-- user_notifications — recipient-generic persisted notifications keyed by User.id.
-- Serves instructors today (STUDENT_IA_MISSED), owners/admins later.
-- Run once in the SQL editor / psql. Safe to re-run: IF NOT EXISTS / ON CONFLICT guards.

CREATE TABLE IF NOT EXISTS user_notifications (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
    type         VARCHAR(50) NOT NULL,
    payload      JSONB NOT NULL DEFAULT '{}',
    dedupe_key   VARCHAR(160),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    read_at      TIMESTAMPTZ,
    dismissed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_notification_dedupe
    ON user_notifications (user_id, dedupe_key);

CREATE INDEX IF NOT EXISTS idx_user_notifications_feed
    ON user_notifications (user_id, created_at DESC);

-- ── Backfill: IA_MISSED for students ─────────────────────────────────────────
-- One IA_MISSED notification per MISSED IASession from the last 7 days, keyed
-- by the student's User.id. (Supersedes the retired student_notifications.sql.)

INSERT INTO user_notifications (user_id, type, payload, dedupe_key, created_at)
SELECT
    st.user_id,
    'IA_MISSED',
    jsonb_build_object(
        'ia_number',         s.ia_number,
        'ia_date',           to_char(s.ia_date, 'YYYY-MM-DD'),
        'momentum_deducted', ABS(COALESCE(s.momentum_awarded, 20))
    ),
    'IA_MISSED:' || to_char(s.ia_date, 'YYYY-MM-DD'),
    s.ia_date::timestamptz
FROM "IASession" s
JOIN institute_students st ON st.id = s.student_id
WHERE s.status = 'MISSED'
  AND s.ia_date >= CURRENT_DATE - INTERVAL '7 days'
ON CONFLICT (user_id, dedupe_key) DO NOTHING;

-- ── Backfill: STUDENT_IA_MISSED for instructors ──────────────────────────────
-- For every MISSED IASession in the last 7 days, notify each instructor of
-- every batch that student belongs to. Dedupe key is per (student, ia_date),
-- so an instructor sharing two batches with the same student gets ONE row.

INSERT INTO user_notifications (user_id, type, payload, dedupe_key, created_at)
SELECT DISTINCT ON (bi.user_id, s.student_id, s.ia_date)
    bi.user_id,
    'STUDENT_IA_MISSED',
    jsonb_build_object(
        'student_id',        st.id,
        'student_user_id',   st.user_id,
        'student_name',      COALESCE(u.name, u.email),
        'batch_id',          bs.batch_id,
        'ia_number',         s.ia_number,
        'ia_date',           to_char(s.ia_date, 'YYYY-MM-DD'),
        'momentum_deducted', ABS(COALESCE(s.momentum_awarded, 20))
    ),
    'STUDENT_IA_MISSED:' || st.user_id || ':' || to_char(s.ia_date, 'YYYY-MM-DD'),
    s.ia_date::timestamptz
FROM "IASession" s
JOIN institute_students st        ON st.id = s.student_id
JOIN "User" u                     ON u.id = st.user_id
JOIN ielts_batch_students bs      ON bs.user_id = st.user_id
JOIN ielts_batch_instructors bi   ON bi.batch_id = bs.batch_id
WHERE s.status = 'MISSED'
  AND s.ia_date >= CURRENT_DATE - INTERVAL '7 days'
ON CONFLICT (user_id, dedupe_key) DO NOTHING;

-- Verify:
-- SELECT type, COUNT(*) FROM user_notifications GROUP BY type;

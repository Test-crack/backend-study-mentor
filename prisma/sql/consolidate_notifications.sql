-- Consolidation: student_notifications → user_notifications (single table).
-- Run once in psql AFTER user_notifications.sql has been applied, and BEFORE
-- deploying the backend that reads student events from user_notifications.
-- Safe to re-run: ON CONFLICT / IF EXISTS guards.

-- 1) Copy student rows across, re-keyed by the student's User.id.
--    read_at / dismissed_at / created_at / dedupe keys all preserved.
INSERT INTO user_notifications (user_id, type, payload, dedupe_key, created_at, read_at, dismissed_at)
SELECT
    st.user_id,
    sn.type,
    sn.payload,
    sn.dedupe_key,
    sn.created_at,
    sn.read_at,
    sn.dismissed_at
FROM student_notifications sn
JOIN institute_students st ON st.id = sn.student_id
ON CONFLICT (user_id, dedupe_key) DO NOTHING;

-- 2) Retire the old table.
DROP TABLE IF EXISTS student_notifications;

-- Verify:
-- SELECT type, COUNT(*) FROM user_notifications GROUP BY type;
-- Expect: IA_MISSED (students) + STUDENT_IA_MISSED (instructors).

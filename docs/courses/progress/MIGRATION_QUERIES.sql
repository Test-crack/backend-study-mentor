-- ============================================================================
-- PROGRESS TRACKING MIGRATION QUERIES
-- ============================================================================
-- Execute these queries in order to implement the progress tracking system

-- ============================================================================
-- PHASE 1: CREATE NEW TABLE - UserContentProgress
-- ============================================================================

CREATE TABLE "UserContentProgress" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "content_item_id" UUID NOT NULL,
  "course_id" UUID NOT NULL,
  "module_id" UUID NOT NULL,
  "status" VARCHAR(50) NOT NULL DEFAULT 'NOT_STARTED',
  "completed_at" TIMESTAMPTZ,
  "last_accessed_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT "fk_user_content_progress_user" 
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "fk_user_content_progress_content_item" 
    FOREIGN KEY ("content_item_id") REFERENCES "CourseContentItem"("id") ON DELETE CASCADE,
  CONSTRAINT "fk_user_content_progress_course" 
    FOREIGN KEY ("course_id") REFERENCES "Course"("id") ON DELETE CASCADE,
  CONSTRAINT "fk_user_content_progress_module" 
    FOREIGN KEY ("module_id") REFERENCES "Module"("id") ON DELETE CASCADE
);

-- Create unique constraint
ALTER TABLE "UserContentProgress" 
ADD CONSTRAINT "unique_user_content_progress" 
UNIQUE ("user_id", "content_item_id");

-- Create indexes for efficient queries
CREATE INDEX "idx_user_content_lookup" 
ON "UserContentProgress"("user_id", "course_id", "module_id");

CREATE INDEX "idx_user_content_status" 
ON "UserContentProgress"("user_id", "status");

CREATE INDEX "idx_content_last_accessed" 
ON "UserContentProgress"("last_accessed_at");

CREATE INDEX "idx_user_module_content" 
ON "UserContentProgress"("user_id", "module_id", "last_accessed_at" DESC);

-- ============================================================================
-- PHASE 2: REMOVE progress_percent FROM UserCourseEnrollment
-- ============================================================================

-- Drop the column if it exists
ALTER TABLE "UserCourseEnrollment" 
DROP COLUMN IF EXISTS "progress_percent";

-- Verify the table structure (optional, for checking)
-- SELECT column_name, data_type FROM information_schema.columns 
-- WHERE table_name = 'UserCourseEnrollment' ORDER BY ordinal_position;

-- ============================================================================
-- PHASE 3: REMOVE progress_percent FROM UserModuleProgress
-- ============================================================================

-- Note: Keep progress_percent in UserModuleProgress as it's calculated on-the-fly
-- This is optional - you can keep it for caching or remove it
-- For now, we'll keep it but it should be recalculated when needed

-- If you want to remove it:
-- ALTER TABLE "UserModuleProgress" 
-- DROP COLUMN IF EXISTS "progress_percent";

-- ============================================================================
-- PHASE 4: CREATE HELPER VIEWS FOR PROGRESS CALCULATION
-- ============================================================================

-- View: User's current position in each course
CREATE OR REPLACE VIEW "v_user_course_position" AS
SELECT 
  uce."user_id",
  uce."course_id",
  uce."module_index",
  uce."status" as course_status,
  uce."enrolled_at",
  uce."last_accessed_at",
  uce."completed_at",
  cm."module_id",
  m."title" as module_title
FROM "UserCourseEnrollment" uce
LEFT JOIN "CourseModule" cm ON uce."course_id" = cm."course_id" 
  AND cm."order_index" = uce."module_index"
LEFT JOIN "Module" m ON cm."module_id" = m."id";

-- View: Module progress calculation
CREATE OR REPLACE VIEW "v_module_progress" AS
SELECT 
  ucp."user_id",
  ucp."module_id",
  ucp."course_id",
  COUNT(*) as total_items,
  COUNT(CASE WHEN cci."is_required" = true THEN 1 END) as required_items,
  COUNT(CASE WHEN ucp."status" = 'COMPLETED' THEN 1 END) as completed_items,
  COUNT(CASE WHEN ucp."status" = 'IN_PROGRESS' THEN 1 END) as in_progress_items,
  ROUND(
    (COUNT(CASE WHEN ucp."status" = 'COMPLETED' THEN 1 END)::NUMERIC / 
     NULLIF(COUNT(CASE WHEN cci."is_required" = true THEN 1 END), 0)) * 100
  ) as progress_percent,
  MAX(ucp."last_accessed_at") as last_accessed_at
FROM "UserContentProgress" ucp
JOIN "CourseContentItem" cci ON ucp."content_item_id" = cci."id"
GROUP BY ucp."user_id", ucp."module_id", ucp."course_id";

-- View: Course progress calculation
CREATE OR REPLACE VIEW "v_course_progress" AS
SELECT 
  uce."user_id",
  uce."course_id",
  COUNT(DISTINCT cm."module_id") as total_modules,
  COUNT(DISTINCT CASE WHEN ump."status" = 'COMPLETED' THEN cm."module_id" END) as completed_modules,
  ROUND(
    (COUNT(DISTINCT CASE WHEN ump."status" = 'COMPLETED' THEN cm."module_id" END)::NUMERIC / 
     NULLIF(COUNT(DISTINCT cm."module_id"), 0)) * 100
  ) as progress_percent
FROM "UserCourseEnrollment" uce
LEFT JOIN "CourseModule" cm ON uce."course_id" = cm."course_id"
LEFT JOIN "UserModuleProgress" ump ON uce."user_id" = ump."user_id" 
  AND cm."module_id" = ump."module_id"
GROUP BY uce."user_id", uce."course_id";

-- ============================================================================
-- PHASE 5: UTILITY FUNCTIONS FOR PROGRESS UPDATES
-- ============================================================================

-- Function: Update module progress based on content completion
CREATE OR REPLACE FUNCTION update_module_progress()
RETURNS TRIGGER AS $$
BEGIN
  -- Update UserModuleProgress when UserContentProgress changes
  UPDATE "UserModuleProgress" ump
  SET 
    "progress_percent" = (
      SELECT ROUND(
        (COUNT(CASE WHEN ucp."status" = 'COMPLETED' THEN 1 END)::NUMERIC / 
         NULLIF(COUNT(CASE WHEN cci."is_required" = true THEN 1 END), 0)) * 100
      )
      FROM "UserContentProgress" ucp
      JOIN "CourseContentItem" cci ON ucp."content_item_id" = cci."id"
      WHERE ucp."user_id" = NEW."user_id" 
        AND ucp."module_id" = ump."module_id"
    ),
    "status" = CASE 
      WHEN (
        SELECT COUNT(CASE WHEN ucp."status" = 'COMPLETED' THEN 1 END)
        FROM "UserContentProgress" ucp
        JOIN "CourseContentItem" cci ON ucp."content_item_id" = cci."id"
        WHERE ucp."user_id" = NEW."user_id" 
          AND ucp."module_id" = ump."module_id"
          AND cci."is_required" = true
      ) = (
        SELECT COUNT(*)
        FROM "CourseContentItem" cci
        WHERE cci."id" IN (
          SELECT ucp."content_item_id"
          FROM "UserContentProgress" ucp
          WHERE ucp."user_id" = NEW."user_id" 
            AND ucp."module_id" = ump."module_id"
        )
        AND cci."is_required" = true
      ) THEN 'COMPLETED'
      WHEN (
        SELECT COUNT(CASE WHEN ucp."status" IN ('COMPLETED', 'IN_PROGRESS') THEN 1 END)
        FROM "UserContentProgress" ucp
        WHERE ucp."user_id" = NEW."user_id" 
          AND ucp."module_id" = ump."module_id"
      ) > 0 THEN 'IN_PROGRESS'
      ELSE 'NOT_STARTED'
    END,
    "updated_at" = now()
  WHERE ump."user_id" = NEW."user_id" 
    AND ump."module_id" = NEW."module_id";
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic module progress update
DROP TRIGGER IF EXISTS "trg_update_module_progress" ON "UserContentProgress";
CREATE TRIGGER "trg_update_module_progress"
AFTER INSERT OR UPDATE ON "UserContentProgress"
FOR EACH ROW
EXECUTE FUNCTION update_module_progress();

-- Function: Update course progress based on module completion
CREATE OR REPLACE FUNCTION update_course_progress()
RETURNS TRIGGER AS $$
BEGIN
  -- Update UserCourseEnrollment when UserModuleProgress changes
  UPDATE "UserCourseEnrollment" uce
  SET 
    "status" = CASE 
      WHEN (
        SELECT COUNT(DISTINCT CASE WHEN ump."status" = 'COMPLETED' THEN cm."module_id" END)
        FROM "CourseModule" cm
        LEFT JOIN "UserModuleProgress" ump ON uce."user_id" = ump."user_id" 
          AND cm."module_id" = ump."module_id"
        WHERE cm."course_id" = uce."course_id"
      ) = (
        SELECT COUNT(DISTINCT cm."module_id")
        FROM "CourseModule" cm
        WHERE cm."course_id" = uce."course_id"
      ) THEN 'COMPLETED'
      WHEN (
        SELECT COUNT(DISTINCT CASE WHEN ump."status" IN ('COMPLETED', 'IN_PROGRESS') THEN cm."module_id" END)
        FROM "CourseModule" cm
        LEFT JOIN "UserModuleProgress" ump ON uce."user_id" = ump."user_id" 
          AND cm."module_id" = ump."module_id"
        WHERE cm."course_id" = uce."course_id"
      ) > 0 THEN 'IN_PROGRESS'
      ELSE 'NOT_STARTED'
    END,
    "updated_at" = now()
  WHERE uce."user_id" = NEW."user_id" 
    AND uce."course_id" = NEW."course_id";
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic course progress update
DROP TRIGGER IF EXISTS "trg_update_course_progress" ON "UserModuleProgress";
CREATE TRIGGER "trg_update_course_progress"
AFTER INSERT OR UPDATE ON "UserModuleProgress"
FOR EACH ROW
EXECUTE FUNCTION update_course_progress();

-- ============================================================================
-- PHASE 6: QUERY EXAMPLES FOR APPLICATION USE
-- ============================================================================

-- Query 1: Get user's resume data for a course
-- SELECT * FROM v_user_course_position WHERE user_id = $1 AND course_id = $2;

-- Query 2: Get last accessed content item in a module
-- SELECT 
--   ucp."content_item_id",
--   ucp."status",
--   ucp."last_accessed_at",
--   cci."title",
--   cci."content_kind"
-- FROM "UserContentProgress" ucp
-- JOIN "CourseContentItem" cci ON ucp."content_item_id" = cci."id"
-- WHERE ucp."user_id" = $1 
--   AND ucp."module_id" = $2
-- ORDER BY ucp."last_accessed_at" DESC
-- LIMIT 1;

-- Query 3: Get all content items in a module with user progress
-- SELECT 
--   cci."id",
--   cci."title",
--   cci."content_kind",
--   cci."is_required",
--   cci."sequence_order",
--   COALESCE(ucp."status", 'NOT_STARTED') as user_status,
--   ucp."completed_at",
--   ucp."last_accessed_at"
-- FROM "CourseContentItem" cci
-- LEFT JOIN "UserContentProgress" ucp ON cci."id" = ucp."content_item_id" 
--   AND ucp."user_id" = $1
-- WHERE cci."concept_id" IN (
--   SELECT "concept_id" FROM "ModuleConcept" WHERE "module_id" = $2
-- )
-- ORDER BY cci."sequence_order" ASC;

-- Query 4: Get module progress for a user
-- SELECT * FROM v_module_progress 
-- WHERE user_id = $1 AND module_id = $2;

-- Query 5: Get course progress for a user
-- SELECT * FROM v_course_progress 
-- WHERE user_id = $1 AND course_id = $2;

-- ============================================================================
-- PHASE 7: DATA MIGRATION (If migrating from old system)
-- ============================================================================

-- If you have existing progress data, migrate it here
-- Example: Populate UserContentProgress from existing data
-- INSERT INTO "UserContentProgress" (
--   "user_id",
--   "content_item_id",
--   "course_id",
--   "module_id",
--   "status",
--   "completed_at",
--   "last_accessed_at"
-- )
-- SELECT 
--   ump."user_id",
--   cci."id",
--   ump."course_id",
--   ump."module_id",
--   CASE WHEN ump."progress_percent" = 100 THEN 'COMPLETED' ELSE 'IN_PROGRESS' END,
--   ump."completed_at",
--   ump."last_accessed_at"
-- FROM "UserModuleProgress" ump
-- CROSS JOIN "CourseContentItem" cci
-- WHERE cci."concept_id" IN (
--   SELECT "concept_id" FROM "ModuleConcept" WHERE "module_id" = ump."module_id"
-- )
-- ON CONFLICT ("user_id", "content_item_id") DO NOTHING;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify UserContentProgress table exists
-- SELECT table_name FROM information_schema.tables 
-- WHERE table_name = 'UserContentProgress';

-- Verify indexes
-- SELECT indexname FROM pg_indexes 
-- WHERE tablename = 'UserContentProgress';

-- Verify triggers
-- SELECT trigger_name FROM information_schema.triggers 
-- WHERE event_object_table = 'UserContentProgress';

-- Verify views
-- SELECT table_name FROM information_schema.views 
-- WHERE table_schema = 'public' AND table_name LIKE 'v_%';
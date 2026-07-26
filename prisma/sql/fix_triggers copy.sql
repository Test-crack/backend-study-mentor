-- Drop the problematic triggers and functions that reference progress_percent

-- Drop triggers first
DROP TRIGGER IF EXISTS "trg_update_module_progress" ON "UserContentProgress";
DROP TRIGGER IF EXISTS "trg_update_course_progress" ON "UserModuleProgress";

-- Drop functions
DROP FUNCTION IF EXISTS update_module_progress();
DROP FUNCTION IF EXISTS update_course_progress();

-- Drop the progress_percent column if it still exists
ALTER TABLE "UserModuleProgress" DROP COLUMN IF EXISTS "progress_percent";

-- Migration: Remove progress_percent from UserModuleProgress
-- This column is now calculated on-the-fly based on content completion

ALTER TABLE "UserModuleProgress" 
DROP COLUMN IF EXISTS "progress_percent";

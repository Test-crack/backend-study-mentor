-- =========================================================================
-- DRILL SESSION & CONTENT LIBRARY MODELS
-- =========================================================================

-- 1. sub_skill_definitions
CREATE TABLE IF NOT EXISTS "sub_skill_definitions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "exam_type" TEXT NOT NULL,
    "skill" TEXT NOT NULL,
    "sub_skill" TEXT NOT NULL,
    "drill_type" TEXT NOT NULL,
    "priority_order" INTEGER NOT NULL,
    "level_a_threshold" NUMERIC NOT NULL,
    "level_b_threshold" NUMERIC NOT NULL,

    CONSTRAINT "sub_skill_definitions_pkey" PRIMARY KEY ("id")
);

-- 2. content_library
CREATE TABLE IF NOT EXISTS "content_library" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "skill" TEXT NOT NULL,
    "sub_skill" TEXT NOT NULL,
    "level" CHAR(1) NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "type" TEXT NOT NULL,
    "watch_time_mins" INTEGER NOT NULL,
    "reflection_keywords" TEXT[],
    "times_served" INTEGER NOT NULL DEFAULT 0,
    "times_effective" INTEGER NOT NULL DEFAULT 0,

    -- Recommendation fields (Merged to replace RecommendationItem later)
    "content" TEXT,
    "description" TEXT,
    "thumbnail_url" TEXT,
    "source" VARCHAR(150),
    "skill_type" "IeltsSkillType",
    "rec_level" "RecommendationLevel",
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,

    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_library_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "content_library_skill_type_rec_level_is_active_idx" 
ON "content_library"("skill_type", "rec_level", "is_active");

-- 3. drill_sessions
CREATE TABLE IF NOT EXISTS "drill_sessions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "student_id" UUID NOT NULL,
    "skill" TEXT NOT NULL,
    "sub_skill" TEXT NOT NULL,
    "drill_type" TEXT NOT NULL,
    "prompts_completed" INTEGER NOT NULL,
    "momentum_earned" INTEGER NOT NULL,
    "ai_feedback_json" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drill_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "drill_sessions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "institute_students"("id") ON DELETE CASCADE
);

-- 4. content_completions
CREATE TABLE IF NOT EXISTS "content_completions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "student_id" UUID NOT NULL,
    "content_id" UUID NOT NULL,
    "reflection_text" TEXT NOT NULL,
    "reflection_passed" BOOLEAN NOT NULL,
    "apply_drill_completed" BOOLEAN NOT NULL,
    "completed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_completions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "content_completions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "institute_students"("id") ON DELETE CASCADE,
    CONSTRAINT "content_completions_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "content_library"("id") ON DELETE CASCADE
);

-- Note: In case you created the PascalCase "ContentLibrary" table earlier, you can safely drop it:
-- DROP TABLE IF EXISTS "ContentLibrary";

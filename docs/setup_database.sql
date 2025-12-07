-- ============================================================================
-- Database Setup for Concept-Based Learning System
-- ============================================================================
-- Run these commands in PostgreSQL to create the schema manually
-- Or use: psql -h 72.60.221.118 -U root -d study_mentor_db -f setup_database.sql
-- ============================================================================

-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. USER TABLE (Already exists, but included for reference)
-- ============================================================================

-- Check if User table exists, if not create it
CREATE TABLE IF NOT EXISTS "User" (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supabaseuserid VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    "createdAt" TIMESTAMPTZ(6) DEFAULT NOW() NOT NULL,
    "updatedAt" TIMESTAMPTZ(6) DEFAULT NOW() NOT NULL
);

-- Create index on email
CREATE INDEX IF NOT EXISTS "User_email_idx" ON "User"(email);

-- ============================================================================
-- 2. CONCEPT TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS "Concept" (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "conceptId" VARCHAR(100) UNIQUE NOT NULL,           -- e.g., BIOLOGY.PHOTOSYNTHESIS.001
    "baseConceptId" VARCHAR(100) NOT NULL,              -- e.g., BIOLOGY.PHOTOSYNTHESIS
    domain VARCHAR(50) NOT NULL,                        -- e.g., biology, physics, math
    "conceptSlug" VARCHAR(100) NOT NULL,                -- e.g., photosynthesis
    sequence INTEGER NOT NULL,                          -- 1, 2, 3...
    keywords TEXT[] NOT NULL DEFAULT '{}',              -- Array of keywords
    "learningObjective" TEXT NOT NULL,                  -- "Students will be able to..."
    "createdAt" TIMESTAMPTZ(6) DEFAULT NOW() NOT NULL,
    "updatedAt" TIMESTAMPTZ(6) DEFAULT NOW() NOT NULL,
    
    -- Constraints
    CONSTRAINT "Concept_baseConceptId_sequence_key" UNIQUE ("baseConceptId", sequence)
);

-- Create indexes for Concept table
CREATE INDEX IF NOT EXISTS "Concept_domain_idx" ON "Concept"(domain);
CREATE INDEX IF NOT EXISTS "Concept_conceptSlug_idx" ON "Concept"("conceptSlug");
CREATE INDEX IF NOT EXISTS "Concept_baseConceptId_idx" ON "Concept"("baseConceptId");

-- Create GIN index for keyword array search (optional but recommended)
CREATE INDEX IF NOT EXISTS "Concept_keywords_idx" ON "Concept" USING GIN(keywords);

-- ============================================================================
-- 3. USER_CONCEPT TABLE (Junction/Relation Table)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "UserConcept" (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "userId" UUID NOT NULL,
    "conceptId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) DEFAULT NOW() NOT NULL,
    
    -- Foreign keys
    CONSTRAINT "UserConcept_userId_fkey" 
        FOREIGN KEY ("userId") 
        REFERENCES "User"(id) 
        ON DELETE CASCADE,
    
    CONSTRAINT "UserConcept_conceptId_fkey" 
        FOREIGN KEY ("conceptId") 
        REFERENCES "Concept"(id) 
        ON DELETE CASCADE,
    
    -- Unique constraint - one record per user-concept pair
    CONSTRAINT "UserConcept_userId_conceptId_key" UNIQUE ("userId", "conceptId")
);

-- Create indexes for UserConcept table
CREATE INDEX IF NOT EXISTS "UserConcept_userId_idx" ON "UserConcept"("userId");
CREATE INDEX IF NOT EXISTS "UserConcept_conceptId_idx" ON "UserConcept"("conceptId");

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to get next sequence number for a base concept
CREATE OR REPLACE FUNCTION get_next_concept_sequence(base_concept_id VARCHAR)
RETURNS INTEGER AS $$
DECLARE
    next_seq INTEGER;
BEGIN
    SELECT COALESCE(MAX(sequence), 0) + 1 
    INTO next_seq
    FROM "Concept"
    WHERE "baseConceptId" = base_concept_id;
    
    RETURN next_seq;
END;
$$ LANGUAGE plpgsql;

-- Function to build full concept ID
CREATE OR REPLACE FUNCTION build_concept_id(base_concept_id VARCHAR, seq INTEGER)
RETURNS VARCHAR AS $$
BEGIN
    RETURN base_concept_id || '.' || LPAD(seq::TEXT, 3, '0');
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- CLEANUP (Use with caution!)
-- ============================================================================

-- DROP TABLE IF EXISTS "UserConcept" CASCADE;
-- DROP TABLE IF EXISTS "Concept" CASCADE;
-- DROP FUNCTION IF EXISTS get_next_concept_sequence(VARCHAR);
-- DROP FUNCTION IF EXISTS build_concept_id(VARCHAR, INTEGER);

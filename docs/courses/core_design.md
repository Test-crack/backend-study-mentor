# 🧠 Course System Core Design

This document outlines the architectural design and flow for the course system. It serves as the source of truth for the logic, schema, and user flows.

---

## 🎯 Executive Summary (High-Level Flow)

The system is designed to be **modular**, **scalable**, and **user-centric**. It moves away from monolithic course structures to a flexible "LEGO-block" approach where learning concepts can be reused, reordered, and repackaged into different courses without duplication.

### Key Pillars
1.  **Atomic Concepts**: The smallest unit of knowledge (e.g., "What is a Variable?") is a `Concept`. It exists once but can be used everywhere.
2.  **Reusable Modules**: Concepts are grouped into `Modules` (e.g., "Python Basics"). These modules can be plugged into multiple courses (e.g., "Intro to Programming" AND "Data Science 101").
3.  **Polymorphic Content**: We support diverse learning materials (Notes, MCQs, Videos) attached to concepts, easily extensible in the future.
4.  **Context-Aware Progress**: A user's progress is tracked per course. If they take the same module in a different course, the system is smart enough to know the context.

### User Journey
1.  **Discovery**: User browses the `Course` catalog.
2.  **Enrollment**: User enrolls, creating a `UserCourseEnrollment` record.
3.  **Learning**:
    *   User opens a `Course`.
    *   System loads the ordered list of `Modules`.
    *   User enters a `Module` and sees ordered `Concepts`.
    *   User interacts with `Content` (reads notes, takes MCQs).
4.  **Tracking**:
    *   *Micro-level*: System tracks which specific concepts are viewed.
    *   *Meso-level*: `UserModuleProgress` updates percentages for that specific module within that specific course.
    *   *Macro-level*: `UserCourseEnrollment` updates overall course completion.

---

## 🏗️ Technical Architecture

### 1. Data Hierarchy & Relationships

*   **Course** (Root)
    *   Has many **Modules** (via `CourseModule` with ordering).
*   **Module** (Container)
    *   Has many **Concepts** (via `ModuleConcept` with ordering).
*   **Concept** (Atom)
    *   Has many **ContentItems** (Polymorphic: Notes, MCQs, etc.).
*   **User** (Actor)
    *   Has **Enrollments** (Course level).
    *   Has **Progress** (Module level, scoped by course).

### 2. Schema Design (Prisma)

#### Enums
Standardized enumerations for strict typing.
*   `DifficultyType`: BEGINNER, INTERMEDIATE, ADVANCED
*   `CourseContentType`: NOTES, MCQ, FLASHCARD, VIDEO, PDF
*   `ProgressStatus`: NOT_STARTED, IN_PROGRESS, COMPLETED

#### Core Models

**Course System**
*   `Course`: The sellable/enrollable unit. Contains metadata like price, difficulty, etc.
*   `Module`: Reusable containers of knowledge.
*   `CourseModule`: **The Junction Table**. Critical for reusability. It maps `Course -> Module` and defines the *Order*.
*   `Concept`: The learning objective. 
*   `ModuleConcept`: Maps `Module -> Concept` with specific ordering.

**Content System**
*   `CourseContentItem`: The base table for all content. It links to a `Concept`.
*   `Note`, `MCQ`, `Video`: Specific tables that link 1:1 to `CourseContentItem`. This allows us to query "Getting all content for Concept X" easily, then fetch details.

**User Progress System**
*   `UserCourseEnrollment`: High-level tracking. "Is user A allowed to see Course B? Are they done?"
*   `UserModuleProgress`: The workhorse. Tracks status, completion % of a module *within a specific course context*. This allows the same "Python Basics" module to be "In Progress" in Course A but "Not Started" in Course B if needed (or linked if we choose generic logic later).

---

## 🔁 Detailed System Flows

### A. Course Creation Flow (Admin/Content Creator)
1.  **Create Concept**: "Variables in Python" created in `Concept` table.
2.  **Add Content**: 
    *   Create `CourseContentItem` (Type: NOTE) linked to Concept.
    *   Create `Note` entry with markdown body.
3.  **Create Module**: "Python Basics" created in `Module` table.
4.  **Link Concept**: Add "Variables in Python" to "Python Basics" via `ModuleConcept` (Order: 1).
5.  **Create Course**: "Data Science 101" created in `Course` table.
6.  **Link Module**: Add "Python Basics" to "Data Science 101" via `CourseModule` (Order: 1).

### B. User Progress Flow
1.  **Start**: User clicks "Start Course".
    *   Logic: Check/Create `UserCourseEnrollment` record.
2.  **View Module**: User clicks "Python Basics".
    *   Logic: Fetch `UserModuleProgress` (where `user=u`, `module=m`, `course=c`). If null, create with `NOT_STARTED`.
3.  **Complete Concept**: User finishes reading Note.
    *   Logic: Update granular tracking (e.g., `UserConcept`).
    *   Logic: Recalculate percent for `UserModuleProgress`.
    *   Logic: If module percent = 100%, mark `COMPLETED` and update `UserCourseEnrollment` percent.

---

## 📜 Final Database Schema Reference

This reflects the implemented Prisma schema.

```prisma
// --------------------
// ENUMS
// --------------------

enum DifficultyType {
  BEGINNER
  INTERMEDIATE
  ADVANCED
}

enum CourseContentType {
  NOTES
  MCQ
  FLASHCARD
  VIDEO
  PDF
}

enum ProgressStatus {
  NOT_STARTED
  IN_PROGRESS
  COMPLETED
}

// --------------------
// CORE COURSE MODELS
// --------------------

model Course {
  id                   String                 @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  title                String                 @db.VarChar(500)
  description          String?
  domain               String?                @db.VarChar(100)
  difficulty           DifficultyType?        @default(BEGINNER)
  duration_minutes     Int?
  price                Decimal?               @db.Decimal(10, 2)
  is_published         Boolean?               @default(false)
  created_at           DateTime?              @default(now()) @db.Timestamptz(6)
  updated_at           DateTime?              @default(now()) @db.Timestamptz(6)
  
  // Relations
  CourseModule         CourseModule[]
  UserCourseEnrollment UserCourseEnrollment[]
  UserModuleProgress   UserModuleProgress[]

  @@index([domain])
  @@index([difficulty])
  @@index([is_published])
}

model Module {
  id                 String               @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  title              String               @db.VarChar(300)
  description        String?
  domain             String?              @db.VarChar(100)
  created_at         DateTime?            @default(now()) @db.Timestamptz(6)
  updated_at         DateTime?            @default(now()) @db.Timestamptz(6)
  
  // Relations
  CourseModule       CourseModule[]
  ModuleConcept      ModuleConcept[]
  UserModuleProgress UserModuleProgress[]

  @@index([domain])
}

model Concept {
  id                String              @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  conceptId         String              @unique @db.VarChar(100) // Business ID/Slug
  sequence          Int
  learningObjective String
  
  // Relations
  CourseContentItem CourseContentItem[]
  ModuleConcept     ModuleConcept[]
  UserConcept       UserConcept[]
  
  // ... (Legacy fields omitted for brevity)
}

// --------------------
// JUNCTION TABLES (ORDERING)
// --------------------

model CourseModule {
  id          String    @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  course_id   String    @db.Uuid
  module_id   String    @db.Uuid
  order_index Int
  created_at  DateTime? @default(now()) @db.Timestamptz(6)
  
  Course      Course    @relation(fields: [course_id], references: [id], onDelete: Cascade)
  Module      Module    @relation(fields: [module_id], references: [id], onDelete: Cascade)

  @@unique([course_id, module_id])
  @@unique([course_id, order_index]) // No two modules in same spot
  @@index([course_id, order_index]) // Fast syllabus fetch
}

model ModuleConcept {
  id          String    @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  module_id   String    @db.Uuid
  concept_id  String    @db.Uuid
  order_index Int
  
  Module      Module    @relation(fields: [module_id], references: [id], onDelete: Cascade)
  Concept     Concept   @relation(fields: [concept_id], references: [id], onDelete: Cascade)

  @@unique([module_id, concept_id])
  @@unique([module_id, order_index])
  @@index([module_id, order_index])
}

// --------------------
// CONTENT SYSTEM
// --------------------

model CourseContentItem {
  id             String            @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  concept_id     String            @db.Uuid
  content_kind   CourseContentType
  title          String?           @db.VarChar(300)
  sequence_order Int?              @default(0)
  is_required    Boolean?          @default(true)
  
  Concept        Concept           @relation(fields: [concept_id], references: [id], onDelete: Cascade)
  
  // Polymorphic Relations
  MCQ            MCQ?
  Note           Note?
  
  @@index([concept_id])
}

model Note {
  id                String            @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  content_item_id   String            @unique @db.Uuid
  body              String
  format            String?           @default("markdown")
  CourseContentItem CourseContentItem @relation(fields: [content_item_id], references: [id], onDelete: Cascade)
}

model MCQ {
  id                String            @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  content_item_id   String            @unique @db.Uuid
  question          String
  options           Json
  correct_answer    String
  explanation       String?
  CourseContentItem CourseContentItem @relation(fields: [content_item_id], references: [id], onDelete: Cascade)
}

// --------------------
// USER PROGRESS SYSTEM
// --------------------

model UserCourseEnrollment {
  id               String          @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  user_id          String          @db.Uuid
  course_id        String          @db.Uuid
  status           ProgressStatus? @default(NOT_STARTED)
  progress_percent Int?            @default(0)
  enrolled_at      DateTime?       @default(now())
  
  Course           Course          @relation(fields: [course_id], references: [id], onDelete: Cascade)
  User             User            @relation(fields: [user_id], references: [id], onDelete: Cascade)

  @@unique([user_id, course_id])
  @@index([user_id, status])
}

model UserModuleProgress {
  id               String          @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  user_id          String          @db.Uuid
  module_id        String          @db.Uuid
  course_id        String          @db.Uuid // Context vital
  status           ProgressStatus? @default(NOT_STARTED)
  progress_percent Int?            @default(0)
  
  Course           Course          @relation(fields: [course_id], references: [id], onDelete: Cascade)
  Module           Module          @relation(fields: [module_id], references: [id], onDelete: Cascade)
  User             User            @relation(fields: [user_id], references: [id], onDelete: Cascade)

  @@unique([user_id, module_id, course_id])
  @@index([user_id, course_id])
}
```

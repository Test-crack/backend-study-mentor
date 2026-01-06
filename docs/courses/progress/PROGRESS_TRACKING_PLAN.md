# Progress Tracking Architecture Plan

## Current State Analysis

### Existing Models
- **UserCourseEnrollment**: Tracks course-level progress
  - `module_index`: Current module position (0-based)
  - `progress_percent`: Calculated from module progress
  - `status`: NOT_STARTED | IN_PROGRESS | COMPLETED

- **UserModuleProgress**: Tracks module-level progress
  - `progress_percent`: Calculated from content completion
  - `status`: NOT_STARTED | IN_PROGRESS | COMPLETED

- **Hierarchy**: Course → CourseModule → Module → ModuleConcept → Concept → CourseContentItem

### Problem
No tracking at the **content item level** (CourseContentItem). When a user logs back in, we can't restore their exact position within a module (which content item they were on).

---

## Proposed Solution

### 1. Schema Changes

#### Add New Model: `UserContentProgress`
Track completion status for each content item a user has interacted with.

```prisma
model UserContentProgress {
  id                String            @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  user_id           String            @db.Uuid
  course_id         String            @db.Uuid
  module_id         String            @db.Uuid
  content_item_id   String            @db.Uuid
  status            ProgressStatus    @default(NOT_STARTED)
  completed_at      DateTime?         @db.Timestamptz(6)
  last_accessed_at  DateTime          @default(now()) @db.Timestamptz(6)
  
  User              User              @relation(fields: [user_id], references: [id], onDelete: Cascade)
  CourseContentItem CourseContentItem @relation(fields: [content_item_id], references: [id], onDelete: Cascade)
  Course            Course            @relation(fields: [course_id], references: [id], onDelete: Cascade)
  Module            Module            @relation(fields: [module_id], references: [id], onDelete: Cascade)

  @@unique([user_id, content_item_id], map: "unique_user_content_progress")
  @@index([user_id, course_id, module_id], map: "idx_user_content_lookup")
  @@index([user_id, status], map: "idx_user_content_status")
  @@index([last_accessed_at], map: "idx_content_last_accessed")
}
```

#### Update Existing Models

**CourseContentItem** - Add relation:
```prisma
model CourseContentItem {
  // ... existing fields ...
  UserContentProgress UserContentProgress[]
}
```

**Course** - Add relation:
```prisma
model Course {
  // ... existing fields ...
  UserContentProgress UserContentProgress[]
}
```

**Module** - Add relation:
```prisma
model Module {
  // ... existing fields ...
  UserContentProgress UserContentProgress[]
}
```

**User** - Add relation:
```prisma
model User {
  // ... existing fields ...
  UserContentProgress UserContentProgress[]
}
```

#### Simplify UserCourseEnrollment
Remove `progress_percent` (will be calculated):
```prisma
model UserCourseEnrollment {
  id               String          @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  user_id          String          @db.Uuid
  course_id        String          @db.Uuid
  enrolled_at      DateTime?       @default(now()) @db.Timestamptz(6)
  last_accessed_at DateTime?       @default(now()) @db.Timestamptz(6)
  completed_at     DateTime?       @db.Timestamptz(6)
  status           ProgressStatus? @default(NOT_STARTED)
  module_index     Int?            @default(0)
  Course           Course          @relation(fields: [course_id], references: [id], onDelete: Cascade)
  User             User            @relation(fields: [user_id], references: [id], onDelete: Cascade)

  @@unique([user_id, course_id], map: "unique_user_course_enrollment")
  @@index([user_id, status], map: "idx_user_course_enrollment")
}
```

---

## 2. Progress Calculation Logic

### Content Item Level
```
status = COMPLETED if user has viewed/completed the content
status = IN_PROGRESS if user has started but not completed
status = NOT_STARTED if user hasn't accessed
```

### Module Level Progress
```
completed_items = COUNT(UserContentProgress WHERE status = COMPLETED)
total_required_items = COUNT(CourseContentItem WHERE is_required = true)
progress_percent = (completed_items / total_required_items) * 100

status = COMPLETED if progress_percent = 100
status = IN_PROGRESS if progress_percent > 0
status = NOT_STARTED if progress_percent = 0
```

### Course Level Progress
```
completed_modules = COUNT(UserModuleProgress WHERE status = COMPLETED)
total_modules = COUNT(CourseModule)
progress_percent = (completed_modules / total_modules) * 100

status = COMPLETED if progress_percent = 100
status = IN_PROGRESS if progress_percent > 0
status = NOT_STARTED if progress_percent = 0
```

---

## 3. Data Flow & API Endpoints

### On Course Enrollment
```
POST /api/courses/:courseId/enroll
→ Create UserCourseEnrollment (module_index = 0, status = NOT_STARTED)
→ Create UserModuleProgress for first module (status = NOT_STARTED)
```

### On Content Access
```
POST /api/courses/:courseId/modules/:moduleIndex/content/:contentItemId/access
→ Create/Update UserContentProgress (status = IN_PROGRESS, last_accessed_at = now)
→ Update UserModuleProgress (recalculate progress_percent)
→ Update UserCourseEnrollment (last_accessed_at = now)
```

### On Content Completion
```
POST /api/courses/:courseId/modules/:moduleIndex/content/:contentItemId/complete
→ Update UserContentProgress (status = COMPLETED, completed_at = now)
→ Recalculate UserModuleProgress
→ If module complete, advance module_index in UserCourseEnrollment
→ Recalculate UserCourseEnrollment progress
```

### On Login / Resume
```
GET /api/courses/:courseId/resume
→ Fetch UserCourseEnrollment (get module_index)
→ Fetch UserModuleProgress for current module
→ Fetch UserContentProgress for all items in module
→ Return: current module, last accessed content item, progress data
```

---

## 4. Service Layer Structure

### `progressService.ts`
```typescript
// Calculate progress at different levels
calculateModuleProgress(userId, moduleId, courseId): Promise<ProgressData>
calculateCourseProgress(userId, courseId): Promise<ProgressData>

// Track content access
trackContentAccess(userId, contentItemId, courseId, moduleId): Promise<void>
markContentComplete(userId, contentItemId, courseId, moduleId): Promise<void>

// Resume functionality
getResumeData(userId, courseId): Promise<ResumeData>
```

### `courseService.ts` (Updated)
```typescript
// Existing methods + new ones
enrollUserInCourse(userId, courseId): Promise<Enrollment>
getModuleContent(userId, courseId, moduleIndex): Promise<ModuleWithProgress>
advanceToNextModule(userId, courseId): Promise<void>
```

---

## 5. Database Queries

### Get User's Current Position in Course
```sql
SELECT 
  uce.module_index,
  uce.status as course_status,
  ump.progress_percent as module_progress,
  ucp.content_item_id as last_content_item,
  ucp.status as content_status
FROM UserCourseEnrollment uce
LEFT JOIN UserModuleProgress ump ON uce.user_id = ump.user_id 
  AND ump.module_id = (
    SELECT module_id FROM CourseModule 
    WHERE course_id = uce.course_id AND order_index = uce.module_index
  )
LEFT JOIN UserContentProgress ucp ON uce.user_id = ucp.user_id 
  AND ucp.module_id = ump.module_id
  AND ucp.last_accessed_at = (
    SELECT MAX(last_accessed_at) FROM UserContentProgress 
    WHERE user_id = uce.user_id AND module_id = ump.module_id
  )
WHERE uce.user_id = ? AND uce.course_id = ?
```

### Calculate Module Progress
```sql
SELECT 
  COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as completed,
  COUNT(CASE WHEN is_required = true THEN 1 END) as total_required
FROM UserContentProgress ucp
JOIN CourseContentItem cci ON ucp.content_item_id = cci.id
WHERE ucp.user_id = ? AND ucp.module_id = ?
```

---

## 6. Migration Strategy

### Phase 1: Schema
1. Create `UserContentProgress` model
2. Add relations to Course, Module, User, CourseContentItem
3. Remove `progress_percent` from UserCourseEnrollment

### Phase 2: Service Layer
1. Implement `progressService.ts` with calculation logic
2. Update `courseService.ts` to use new progress tracking
3. Add helper functions for progress calculations

### Phase 3: API Updates
1. Update `getModuleContent` to include progress data
2. Add `POST /api/courses/:courseId/modules/:moduleIndex/content/:contentItemId/access`
3. Add `POST /api/courses/:courseId/modules/:moduleIndex/content/:contentItemId/complete`
4. Add `GET /api/courses/:courseId/resume`

### Phase 4: Frontend Integration
1. Call access endpoint when user views content
2. Call complete endpoint when user finishes content
3. Use resume endpoint on login to restore position

---

## 7. Key Benefits

✅ **Granular Tracking**: Know exactly which content items user has completed
✅ **Accurate Progress**: Calculate from actual completion, not estimates
✅ **Resume Capability**: Restore user to exact position in course
✅ **Audit Trail**: `last_accessed_at` tracks engagement
✅ **Scalable**: Efficient queries with proper indexing
✅ **Flexible**: Support optional vs required content

---

## 8. Example: User Resume Flow

```
User logs in → GET /api/courses/:courseId/resume
  ↓
Query UserCourseEnrollment (get module_index = 2)
  ↓
Query UserModuleProgress for module 2 (progress_percent = 45%)
  ↓
Query UserContentProgress for module 2 (find last_accessed_at)
  ↓
Return: {
  currentModule: 2,
  moduleProgress: 45%,
  lastContentItem: "content-123",
  contentStatus: "IN_PROGRESS",
  resumeUrl: "/courses/:courseId/modules/2/content/content-123"
}
  ↓
Frontend redirects to resume URL
```

---

## 9. Implementation Checklist

- [ ] Create migration for UserContentProgress model
- [ ] Add relations to existing models
- [ ] Implement progressService.ts
- [ ] Update courseService.ts
- [ ] Add progress calculation helpers
- [ ] Create API endpoints for access/complete/resume
- [ ] Add tests for progress calculations
- [ ] Update courseController.ts
- [ ] Add frontend integration
- [ ] Test resume flow end-to-end

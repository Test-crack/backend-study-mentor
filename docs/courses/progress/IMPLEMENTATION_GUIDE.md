# Progress Tracking Implementation Guide

## Quick Start

### 1. Database Migration
Execute the SQL queries from `MIGRATION_QUERIES.sql` in order:

```bash
# Connect to your PostgreSQL database
psql -U your_user -d your_database -f MIGRATION_QUERIES.sql
```

Or execute them manually in your database client.

### 2. Update Prisma Schema
The schema has already been updated with:
- `UserContentProgress` model
- Relations added to Course, Module, User, CourseContentItem
- Removed `progress_percent` from `UserCourseEnrollment`

Generate Prisma client:
```bash
npx prisma generate
```

### 3. Install Service Layer
Copy `src/services/progressService.ts` to your project.

### 4. Update Controller
Update `src/controllers/courseController.ts` with the new endpoints:
- `markContentComplete`
- `trackContentAccessEndpoint`
- `getCourseResumeData`

### 5. Add Routes
Create `src/routes/progressRoutes.ts` and register in your main app file:

```typescript
import progressRoutes from './routes/progressRoutes';

app.use('/api/progress', progressRoutes);
```

### 6. Add Types
Copy `src/types/progress.ts` for TypeScript support.

---

## Architecture Overview

```
Frontend
   ↓
API Endpoints (progressRoutes.ts)
   ↓
Controllers (courseController.ts)
   ↓
Services (progressService.ts)
   ↓
Database (PostgreSQL with triggers)
```

### Data Flow: Marking Content Complete

```
POST /api/progress/courses/:courseId/modules/:moduleIndex/content/:contentItemId/complete
   ↓
1. Validate user authentication & enrollment
   ↓
2. Verify content item belongs to module
   ↓
3. Call markContentAsCompleted()
   ├─ Update UserContentProgress (status = COMPLETED)
   ├─ Calculate module progress
   ├─ Update UserModuleProgress
   ├─ Calculate course progress
   ├─ Update UserCourseEnrollment
   └─ Check if module completed → advance to next
   ↓
4. Return progress data with module advancement info
   ↓
Frontend updates UI and navigates if needed
```

---

## Service Layer Functions

### `calculateModuleProgress(userId, moduleId, courseId)`
Calculates module progress based on completed required content items.

**Returns:**
```typescript
{
  progress_percent: number,
  status: ProgressStatus,
  completed_items: number,
  total_required_items: number
}
```

**Usage:**
```typescript
const progress = await calculateModuleProgress(userId, moduleId, courseId);
console.log(`Module is ${progress.progress_percent}% complete`);
```

### `calculateCourseProgress(userId, courseId)`
Calculates course progress based on completed modules.

**Returns:** Same as module progress

### `updateModuleProgress(userId, moduleId, courseId)`
Updates `UserModuleProgress` with calculated values.

**Returns:**
```typescript
{
  moduleProgress: ProgressData,
  moduleUpdated: boolean
}
```

### `updateCourseProgress(userId, courseId)`
Updates `UserCourseEnrollment` and handles module advancement.

**Returns:**
```typescript
{
  courseProgress: ProgressData,
  courseUpdated: boolean,
  moduleAdvanced: boolean,
  nextModuleIndex?: number
}
```

### `markContentAsCompleted(userId, contentItemId, courseId, moduleId)`
Main function that orchestrates all progress updates.

**Returns:**
```typescript
{
  contentProgress: UserContentProgress,
  moduleProgress: ProgressData,
  courseProgress: ProgressData,
  moduleAdvanced: boolean,
  nextModuleIndex?: number
}
```

### `trackContentAccess(userId, contentItemId, courseId, moduleId)`
Marks content as IN_PROGRESS when accessed.

**Returns:** UserContentProgress record

### `getResumeData(userId, courseId)`
Retrieves user's current position and progress for resuming.

**Returns:**
```typescript
{
  currentModuleIndex: number,
  courseStatus: ProgressStatus,
  moduleProgress: number,
  moduleStatus: ProgressStatus,
  lastContentItemId: string,
  lastContentStatus: ProgressStatus,
  lastAccessedAt: Date
}
```

---

## API Endpoints

### Complete Content
```
POST /api/progress/courses/:courseId/modules/:moduleIndex/content/:contentItemId/complete
```

**When to call:** User finishes viewing/completing a content item

**Response includes:**
- Content completion status
- Updated module progress
- Updated course progress
- Whether module was advanced
- Next module index (if advanced)

### Track Access
```
POST /api/progress/courses/:courseId/modules/:moduleIndex/content/:contentItemId/access
```

**When to call:** User opens/views a content item

**Response includes:**
- Content status (IN_PROGRESS)
- Last accessed timestamp

### Get Resume Data
```
GET /api/progress/courses/:courseId/resume
```

**When to call:** User logs in or navigates to course

**Response includes:**
- Current module index
- Module progress percentage
- Last accessed content item
- Course status

---

## Frontend Integration Examples

### React Hook for Progress Tracking

```typescript
import { useCallback, useEffect } from 'react';

export function useProgressTracking(courseId: string, moduleIndex: number, contentItemId: string) {
  const token = useAuthToken();

  // Track access when content loads
  useEffect(() => {
    trackAccess();
  }, [contentItemId]);

  const trackAccess = useCallback(async () => {
    try {
      await fetch(
        `/api/progress/courses/${courseId}/modules/${moduleIndex}/content/${contentItemId}/access`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );
    } catch (error) {
      console.error('Failed to track access:', error);
    }
  }, [courseId, moduleIndex, contentItemId, token]);

  const completeContent = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/progress/courses/${courseId}/modules/${moduleIndex}/content/${contentItemId}/complete`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      const data = await response.json();
      return data.data;
    } catch (error) {
      console.error('Failed to complete content:', error);
      throw error;
    }
  }, [courseId, moduleIndex, contentItemId, token]);

  return { trackAccess, completeContent };
}
```

### Usage in Component

```typescript
function ContentViewer({ courseId, moduleIndex, contentItemId }) {
  const { completeContent } = useProgressTracking(courseId, moduleIndex, contentItemId);
  const navigate = useNavigate();

  const handleComplete = async () => {
    try {
      const result = await completeContent();

      // Show success message
      showNotification('Content completed!');

      // Update progress bar
      updateProgressBar(result.courseProgress.progress_percent);

      // Navigate to next module if advanced
      if (result.moduleAdvanced) {
        setTimeout(() => {
          navigate(`/courses/${courseId}/modules/${result.nextModuleIndex}`);
        }, 1500);
      }
    } catch (error) {
      showError('Failed to complete content');
    }
  };

  return (
    <div>
      {/* Content display */}
      <button onClick={handleComplete}>Mark as Complete</button>
    </div>
  );
}
```

### Resume Course

```typescript
async function resumeCourse(courseId: string) {
  const token = useAuthToken();

  try {
    const response = await fetch(
      `/api/progress/courses/${courseId}/resume`,
      {
        headers: { 'Authorization': `Bearer ${token}` }
      }
    );

    const { data } = await response.json();

    // Navigate to last accessed content or first content in module
    const targetUrl = data.lastContentItemId
      ? `/courses/${courseId}/modules/${data.currentModuleIndex}/content/${data.lastContentItemId}`
      : `/courses/${courseId}/modules/${data.currentModuleIndex}`;

    navigate(targetUrl);

    // Display progress
    displayProgress({
      courseProgress: data.courseStatus,
      moduleProgress: data.moduleProgress,
    });
  } catch (error) {
    console.error('Failed to resume course:', error);
  }
}
```

---

## Database Schema Relationships

```
User
  ├─ UserCourseEnrollment (1:N)
  │  └─ Course (N:1)
  │     ├─ CourseModule (1:N)
  │     │  └─ Module (N:1)
  │     │     ├─ ModuleConcept (1:N)
  │     │     │  └─ Concept (N:1)
  │     │     │     └─ CourseContentItem (1:N)
  │     │     │        └─ UserContentProgress (N:1)
  │     │     └─ UserModuleProgress (1:N)
  │     └─ UserContentProgress (1:N)
  └─ UserContentProgress (1:N)
```

---

## Progress Calculation Examples

### Example 1: Module with 4 Required Items

```
Content Items:
- Item 1: COMPLETED ✓
- Item 2: COMPLETED ✓
- Item 3: IN_PROGRESS
- Item 4: NOT_STARTED

Calculation:
completed_items = 2
total_required_items = 4
progress_percent = (2 / 4) * 100 = 50%
status = IN_PROGRESS
```

### Example 2: Course with 3 Modules

```
Modules:
- Module 0: COMPLETED ✓
- Module 1: IN_PROGRESS (50%)
- Module 2: NOT_STARTED

Calculation:
completed_modules = 1
total_modules = 3
progress_percent = (1 / 3) * 100 = 33%
status = IN_PROGRESS
```

### Example 3: Module Completion & Advancement

```
Before:
- Module 0: 75% complete (3/4 items)
- User completes 4th item

After:
- Module 0: 100% complete → status = COMPLETED
- module_index advances to 1
- UserModuleProgress created for Module 1
- Response: moduleAdvanced = true, nextModuleIndex = 1
```

---

## Error Handling Checklist

- [ ] User authentication validation
- [ ] Course enrollment verification
- [ ] Content item existence check
- [ ] Module-content relationship validation
- [ ] UUID format validation
- [ ] Module index range validation
- [ ] Database transaction rollback on error
- [ ] Proper HTTP status codes
- [ ] Meaningful error messages

---

## Performance Optimization Tips

### 1. Batch Operations
If marking multiple items complete, consider batching:

```typescript
async function completeMultipleItems(items: Array<{courseId, moduleIndex, contentItemId}>) {
  const results = await Promise.all(
    items.map(item => completeContent(item))
  );
  return results;
}
```

### 2. Client-Side Caching
Cache resume data to reduce API calls:

```typescript
const resumeCache = new Map<string, ResumeData>();

async function getResumeDataCached(courseId: string) {
  if (resumeCache.has(courseId)) {
    return resumeCache.get(courseId);
  }
  const data = await getResumeData(courseId);
  resumeCache.set(courseId, data);
  return data;
}
```

### 3. Debounce Access Tracking
Don't track every single interaction:

```typescript
const debouncedTrackAccess = debounce(() => trackAccess(), 5000);

useEffect(() => {
  debouncedTrackAccess();
}, [contentItemId]);
```

### 4. Lazy Load Progress Data
Only fetch progress when needed:

```typescript
const [progress, setProgress] = useState(null);

useEffect(() => {
  if (showProgressBar) {
    fetchProgress();
  }
}, [showProgressBar]);
```

---

## Testing Checklist

- [ ] Test marking content as completed
- [ ] Test module advancement when all items complete
- [ ] Test progress calculation accuracy
- [ ] Test resume data retrieval
- [ ] Test access tracking
- [ ] Test error cases (not enrolled, invalid IDs, etc.)
- [ ] Test concurrent requests
- [ ] Test with optional vs required content
- [ ] Test with multiple modules
- [ ] Test course completion

---

## Troubleshooting

### Issue: Progress not updating
**Solution:**
1. Verify user is enrolled: `SELECT * FROM "UserCourseEnrollment" WHERE user_id = ? AND course_id = ?`
2. Check content item exists: `SELECT * FROM "CourseContentItem" WHERE id = ?`
3. Verify module-content relationship: `SELECT * FROM "ModuleConcept" WHERE module_id = ? AND concept_id = (SELECT concept_id FROM "CourseContentItem" WHERE id = ?)`

### Issue: Module not advancing
**Solution:**
1. Check all required items are completed: `SELECT COUNT(*) FROM "CourseContentItem" WHERE concept_id IN (SELECT concept_id FROM "ModuleConcept" WHERE module_id = ?) AND is_required = true`
2. Verify next module exists: `SELECT * FROM "CourseModule" WHERE course_id = ? AND order_index = ?`

### Issue: Resume data incorrect
**Solution:**
1. Check last_accessed_at is updating: `SELECT last_accessed_at FROM "UserContentProgress" WHERE user_id = ? ORDER BY last_accessed_at DESC LIMIT 1`
2. Verify module_index in enrollment: `SELECT module_index FROM "UserCourseEnrollment" WHERE user_id = ? AND course_id = ?`

---

## Deployment Checklist

- [ ] Run database migrations
- [ ] Update Prisma schema and generate client
- [ ] Deploy progressService.ts
- [ ] Update courseController.ts
- [ ] Add progressRoutes.ts
- [ ] Register routes in main app
- [ ] Add progress types
- [ ] Test all endpoints
- [ ] Update frontend code
- [ ] Monitor error logs
- [ ] Verify progress calculations
- [ ] Test resume functionality

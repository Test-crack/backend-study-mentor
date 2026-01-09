# Courses API Documentation

Base URL: `/api/courses`

---

## Endpoints Overview

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/` | No | List all courses |
| GET | `/:id` | Optional | Get course details |
| POST | `/enroll` | Yes | Enroll in course |
| GET | `/:courseId/resume` | Yes | Get resume data |
| GET | `/:courseId/module/:orderIndex` | Yes | Get module content |
| POST | `/:courseId/modules/:moduleIndex/content/:contentItemId/access` | Yes | Track content access |
| POST | `/:courseId/modules/:moduleIndex/content/:contentItemId/complete` | Yes | Mark content complete |
| POST | `/:courseId/complete` | Yes | Mark course complete |

---

## 1. List Courses

```
GET /api/courses
```

**Query Params:**
- `page` (default: 1)
- `limit` (default: 10)
- `difficulty` - BEGINNER | INTERMEDIATE | ADVANCED
- `domain` - Filter by domain name
- `search` - Search in title/description
- `sortBy` - price | duration_minutes | created_at | updated_at
- `sortOrder` - asc | desc

**Response:**
```json
{
  "data": [{
    "id": "uuid",
    "title": "Course Title",
    "slug": "course-slug",
    "description": "...",
    "Domain": { "id": "uuid", "name": "Domain", "slug": "domain" },
    "difficulty": "BEGINNER",
    "duration_minutes": 120,
    "price": "99.00",
    "_count": { "CourseModule": 5 }
  }],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 50,
    "totalPages": 5,
    "hasMore": true
  }
}
```

---

## 2. Get Course Details

```
GET /api/courses/:id
```

If authenticated, returns enrollment status and progress.

**Response:**
```json
{
  "data": {
    "id": "uuid",
    "title": "Course Title",
    "slug": "course-slug",
    "description": "...",
    "Domain": { "id": "uuid", "name": "Domain", "slug": "domain" },
    "difficulty": "BEGINNER",
    "duration_minutes": 120,
    "price": "99.00",
    "is_published": true,
    "isEnrolled": true,
    "enrollmentStatus": "IN_PROGRESS",
    "progressPercent": 45,
    "moduleIndex": 1,
    "modules": [{
      "id": "uuid",
      "title": "Module 1",
      "description": "...",
      "order_index": 0,
      "courseModuleId": "uuid",
      "_count": { "ModuleConcept": 3 }
    }]
  }
}
```

---

## 3. Enroll in Course

```
POST /api/courses/enroll
```

**Body:**
```json
{ "courseId": "uuid" }
```

**Response (201):**
```json
{
  "message": "Successfully enrolled in course",
  "data": {
    "id": "uuid",
    "user_id": "uuid",
    "course_id": "uuid",
    "status": "NOT_STARTED",
    "module_index": 0,
    "Course": { "id": "uuid", "title": "...", "slug": "..." },
    "User": { "id": "uuid", "name": "...", "email": "..." }
  }
}
```

---

## 4. Get Resume Data

```
GET /api/courses/:courseId/resume
```

Returns user's current position. Updates status to IN_PROGRESS if NOT_STARTED.

**Response:**
```json
{
  "data": {
    "currentModuleIndex": 1,
    "courseStatus": "IN_PROGRESS",
    "moduleProgress": 50,
    "moduleStatus": "IN_PROGRESS",
    "furthestContentItemId": "uuid",
    "furthestContentStatus": "COMPLETED",
    "lastAccessedContentItemId": "uuid",
    "lastAccessedContentStatus": "IN_PROGRESS",
    "lastAccessedAt": "2024-01-15T10:25:00Z"
  }
}
```

**Fields:**
- `currentModuleIndex` - Current module user is on
- `furthestContentItemId` - Furthest content by sequence order
- `lastAccessedContentItemId` - Most recently accessed content

---

## 5. Get Module Content

```
GET /api/courses/:courseId/module/:orderIndex
```

Updates `last_accessed_at` on enrollment. Returns module content with user's progress status for each content item.

**Response:**
```json
{
  "data": {
    "courseId": "uuid",
    "module": {
      "id": "uuid",
      "title": "Module Title",
      "description": "...",
      "order_index": 0,
      "concepts": [{
        "id": "uuid",
        "learningObjective": "...",
        "slug": "concept-slug",
        "order_index": 0,
        "contentItems": [{
          "id": "uuid",
          "type": "NOTES",
          "title": "Content Title",
          "is_required": true,
          "sequence_order": 0,
          "status": "COMPLETED",
          "completed_at": "2024-01-15T10:30:00Z",
          "content": { "body": "...", "format": "markdown" }
        }, {
          "id": "uuid",
          "type": "MCQ",
          "title": "Quiz Question",
          "is_required": true,
          "sequence_order": 1,
          "status": "NOT_STARTED",
          "completed_at": null,
          "content": {
            "question": "What is...?",
            "options": ["A", "B", "C", "D"],
            "correct_answer": "A",
            "explanation": "..."
          }
        }]
      }]
    }
  }
}
```

**Content Status Values:**
- `NOT_STARTED` - User hasn't accessed this content
- `IN_PROGRESS` - User has accessed but not completed
- `COMPLETED` - User has marked as completed

---

## 6. Track Content Access

```
POST /api/courses/:courseId/modules/:moduleIndex/content/:contentItemId/access
```

Call when user opens content. Marks as IN_PROGRESS (won't downgrade COMPLETED).

**Updates:**
- `UserContentProgress` - status, last_accessed_at
- `UserModuleProgress` - status → IN_PROGRESS, last_accessed_at
- `UserCourseEnrollment` - status → IN_PROGRESS, module_index (if higher)

**Response:**
```json
{
  "message": "Content access tracked",
  "data": {
    "status": "IN_PROGRESS",
    "last_accessed_at": "2024-01-15T10:25:00Z"
  }
}
```

---

## 7. Mark Content Complete

```
POST /api/courses/:courseId/modules/:moduleIndex/content/:contentItemId/complete
```

Call when user finishes content.

**Updates:**
- `UserContentProgress` - status → COMPLETED, completed_at
- `UserModuleProgress` - progress_percent, status, completed_at (if 100%)
- `UserCourseEnrollment` - module_index (advances if module completed)

**Response:**
```json
{
  "message": "Content marked as completed",
  "data": {
    "contentProgress": {
      "status": "COMPLETED",
      "completed_at": "2024-01-15T10:30:00Z"
    },
    "moduleProgress": {
      "progress_percent": 75,
      "status": "IN_PROGRESS",
      "completed_items": 3,
      "total_required_items": 4
    },
    "courseProgress": {
      "progress_percent": 25,
      "status": "IN_PROGRESS"
    },
    "moduleAdvanced": false,
    "nextModuleIndex": null
  }
}
```

When module completes:
```json
{
  "moduleAdvanced": true,
  "nextModuleIndex": 2
}
```

---

## 8. Mark Course Complete

```
POST /api/courses/:courseId/complete
```

Only succeeds if all modules are completed.

**Response (Success):**
```json
{
  "message": "Course completed successfully",
  "data": {
    "courseProgress": {
      "progress_percent": 100,
      "status": "COMPLETED"
    },
    "completed_at": "2024-01-15T12:00:00Z"
  }
}
```

**Response (Error 400):**
```json
{
  "error": "Cannot complete course - not all modules are finished",
  "data": {
    "courseProgress": {
      "progress_percent": 75,
      "status": "IN_PROGRESS"
    }
  }
}
```

---

## Progress Calculation

### Module Progress
```
progress_percent = (completed_required_items / total_required_items) * 100
```

### Course Progress (for display)
```
progress_percent = average of all module progress_percent values
```

Example: 4 modules with progress [100, 75, 0, 0] = (100+75+0+0)/4 = **44%**

### Status Values
- `NOT_STARTED` - No content accessed
- `IN_PROGRESS` - Some content accessed/completed
- `COMPLETED` - All required content completed

---

## Frontend Flow

### 1. Course Page Load
```typescript
// Get course details with enrollment status
const course = await fetch(`/api/courses/${courseId}`);
// If enrolled, progressPercent and moduleIndex are included
```

### 2. Resume Course
```typescript
const resume = await fetch(`/api/courses/${courseId}/resume`);
// Navigate to: /courses/${courseId}/modules/${resume.currentModuleIndex}
// Or to specific content: .../${resume.lastAccessedContentItemId}
```

### 3. Load Module
```typescript
const module = await fetch(`/api/courses/${courseId}/module/${orderIndex}`);
// Each contentItem now includes status and completed_at

// Render with progress indicators
module.data.module.concepts.forEach(concept => {
  concept.contentItems.forEach(item => {
    const isCompleted = item.status === 'COMPLETED';
    const isInProgress = item.status === 'IN_PROGRESS';
    
    // Show checkmark, progress indicator, etc.
    renderContentItem(item, { isCompleted, isInProgress });
  });
});
```

### 4. User Opens Content
```typescript
// Track access immediately
await fetch(`/api/courses/${courseId}/modules/${moduleIndex}/content/${contentId}/access`, {
  method: 'POST'
});
```

### 5. User Completes Content
```typescript
const result = await fetch(`/api/courses/${courseId}/modules/${moduleIndex}/content/${contentId}/complete`, {
  method: 'POST'
});

// Update UI with new progress
updateProgressBar(result.data.courseProgress.progress_percent);

// Navigate to next module if advanced
if (result.data.moduleAdvanced) {
  navigate(`/courses/${courseId}/modules/${result.data.nextModuleIndex}`);
}
```

---

## Error Codes

| Code | Meaning |
|------|---------|
| 400 | Invalid ID format / Bad request |
| 401 | Not authenticated |
| 403 | Not enrolled in course |
| 404 | Course/Module/Content not found |
| 409 | Already enrolled |
| 500 | Server error |

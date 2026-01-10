# Progress Tracking API

Base URL: `/api/courses`

All endpoints require authentication (`requireAuth` + `ensureUser` middleware). User must be enrolled in the course.

---

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/:courseId/modules/:moduleIndex/content/:contentItemId/access` | Track content access |
| POST | `/:courseId/modules/:moduleIndex/content/:contentItemId/complete` | Mark content complete |
| GET | `/:courseId/resume` | Get resume data |

---

## 1. Track Content Access

Marks content as `IN_PROGRESS` when user opens it. Won't downgrade `COMPLETED` status.

```
POST /api/courses/:courseId/modules/:moduleIndex/content/:contentItemId/access
```

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

## 2. Mark Content Complete

Marks content as `COMPLETED` and updates module/course progress.

```
POST /api/courses/:courseId/modules/:moduleIndex/content/:contentItemId/complete
```

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

When module completes, `moduleAdvanced: true` and `nextModuleIndex` contains the next module.

---

## 3. Get Resume Data

Returns user's current position in a course.

```
GET /api/courses/:courseId/resume
```

**Response:**
```json
{
  "data": {
    "currentModuleIndex": 1,
    "courseStatus": "IN_PROGRESS",
    "moduleProgress": 50,
    "moduleStatus": "IN_PROGRESS",
    "furthestContentItemId": "770e8400-e29b-41d4-a716-446655440000",
    "furthestContentStatus": "COMPLETED",
    "lastAccessedContentItemId": "660e8400-e29b-41d4-a716-446655440000",
    "lastAccessedContentStatus": "IN_PROGRESS",
    "lastAccessedAt": "2024-01-15T10:25:00Z"
  }
}
```

- `furthestContentItemId`: The content item with highest sequence order user has reached
- `lastAccessedContentItemId`: The most recently accessed content item
```

---

## Error Codes

| Code | Meaning |
|------|---------|
| 401 | Not authenticated |
| 400 | Invalid ID format or moduleIndex |
| 403 | Not enrolled in course |
| 404 | Module/content not found |
| 500 | Server error |

---

## Progress Calculation

**Module Progress:**
```
progress_percent = (completed_required_items / total_required_items) * 100
```

**Course Progress:**
```
progress_percent = (completed_modules / total_modules) * 100
```

**Status Values:** `NOT_STARTED` → `IN_PROGRESS` → `COMPLETED`

---

## Frontend Usage

```typescript
// Track access when content loads
useEffect(() => {
  fetch(`/api/courses/${courseId}/modules/${moduleIndex}/content/${contentItemId}/access`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });
}, [contentItemId]);

// Mark complete
async function handleComplete() {
  const res = await fetch(
    `/api/courses/${courseId}/modules/${moduleIndex}/content/${contentItemId}/complete`,
    { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } }
  );
  const { data } = await res.json();
  
  if (data.moduleAdvanced) {
    navigate(`/courses/${courseId}/modules/${data.nextModuleIndex}`);
  }
}

// Resume course - navigate to last accessed or furthest point
async function resumeCourse() {
  const res = await fetch(`/api/courses/${courseId}/resume`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const { data } = await res.json();
  
  // Use lastAccessedContentItemId to continue where user left off
  // Or use furthestContentItemId to go to the furthest point reached
  const contentId = data.lastAccessedContentItemId || data.furthestContentItemId;
  if (contentId) {
    navigate(`/courses/${courseId}/modules/${data.currentModuleIndex}/content/${contentId}`);
  }
}
```

# Frontend Integration Guide: Course Thumbnails

Here is how to integrate the new Course Thumbnail features.

## APIs Overview

| Action | Method | URL | Body | Auth |
| :--- | :--- | :--- | :--- | :--- |
| **Get Instructor Courses** | `GET` | `/api/instructor/courses` | - | Required |
| **Upload Thumbnail** | `PUT` | `/api/instructor/courses/:id/thumbnail` | `FormData` (key: `thumbnail`) | Required |
| **Remove Thumbnail** | `DELETE` | `/api/instructor/courses/:id/thumbnail` | - | Required |
| **Get All Courses** (Student) | `GET` | `/api/courses` | - | Optional |
| **Get Single Course** (Student) | `GET` | `/api/courses/:id` | - | Optional |

---

## 1. Data Structure Update

The `Course` object now includes a `thumbnail` field (string URL or null).

```typescript
interface Course {
  id: string;
  title: string;
  description: string;
  thumbnail: string | null; // <--- NEW FIELD
  // ... other fields
}
```

## 2. Upload Thumbnail

Use `FormData` to send the image file.

```typescript
import axios from 'axios';

const uploadCourseThumbnail = async (courseId: string, file: File, token: string) => {
  try {
    const formData = new FormData();
    formData.append('thumbnail', file);

    const response = await axios.put(
      `http://localhost:4000/api/instructor/courses/${courseId}/thumbnail`, 
      formData, 
      {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${token}` 
        }
      }
    );

    console.log('Upload Success:', response.data);
    // Returns: { message: "...", thumbnail: "https://...", course: { ... } }
    return response.data.thumbnail; 
  } catch (error) {
    console.error('Upload Failed:', error);
    throw error;
  }
};
```

## 3. Remove Thumbnail

```typescript
const removeCourseThumbnail = async (courseId: string, token: string) => {
  try {
    const response = await axios.delete(
      `http://localhost:4000/api/instructor/courses/${courseId}/thumbnail`, 
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );

    console.log('Remove Success:', response.data);
    return true;
  } catch (error) {
    console.error('Remove Failed:', error);
    throw error;
  }
};
```

## 4. Displaying Thumbnails

The `thumbnail` field is now available in the standard course APIs (`/api/courses` and `/api/courses/:id`).

```tsx
// React Example
const CourseCard = ({ course }) => {
  return (
    <div className="card">
      <img 
        src={course.thumbnail || '/default-course-placeholder.png'} 
        alt={course.title} 
        className="w-full h-48 object-cover rounded-t"
      />
      <h3>{course.title}</h3>
      {/* ... */}
    </div>
  );
};
```

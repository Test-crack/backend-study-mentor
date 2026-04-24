# Frontend Integration Guide: Profile Image

Here is how to integrate the new Profile Image features using **Axios**.

## APIs Overview

| Action | Method | URL | Body | Auth |
| :--- | :--- | :--- | :--- | :--- |
| **Get Profile** | `GET` | `/api/profile` | - | Required |
| **Upload Image** | `PUT` | `/api/profile/image` | `FormData` (key: `profileImage`) | Required |
| **Remove Image** | `DELETE` | `/api/profile/image` | - | Required |

---

## 1. Upload Profile Image

Use `FormData` to send the file. The backend expects the field name `profileImage`.

```typescript
import axios from 'axios';

// Function to upload image
const uploadProfileImage = async (file: File, token: string) => {
  try {
    const formData = new FormData();
    formData.append('profileImage', file);

    const response = await axios.put('http://localhost:4000/api/profile/image', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        'Authorization': `Bearer ${token}` 
      }
    });

    console.log('Upload Success:', response.data);
    return response.data.user; // Returns updated user object with new profileImage URL
  } catch (error) {
    console.error('Upload Failed:', error);
    throw error;
  }
};
```

## 2. Remove Profile Image

```typescript
const removeProfileImage = async (token: string) => {
  try {
    const response = await axios.delete('http://localhost:4000/api/profile/image', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    console.log('Remove Success:', response.data);
    return response.data.user; // User object with profileImage: null
  } catch (error) {
    console.error('Remove Failed:', error);
    throw error;
  }
};
```

## 3. Displaying the Image

The `GET /api/profile` endpoint now includes the `profileImage` field.

```typescript
// Example React Component Snippet
const UserAvatar = ({ user }) => {
  return (
    <img 
      src={user.profileImage || '/default-avatar.png'} 
      alt={`${user.name}'s profile`} 
      className="w-20 h-20 rounded-full object-cover"
    />
  );
};
```

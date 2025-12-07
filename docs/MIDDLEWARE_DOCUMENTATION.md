# Middleware Authentication Documentation

## Overview

This backend uses a two-layer middleware authentication system with Supabase for user authentication and Prisma for local user management. The system ensures secure API access while maintaining a local user database for application-specific data.

## Architecture

```
Frontend (Supabase Client) → Backend Middleware → Protected Routes
                                    ↓
                            [requireAuth] → [ensureUser]
                                    ↓
                            Supabase Admin → Prisma DB
```

## Middleware Components

### 1. `requireAuth` Middleware

**Location:** `src/middleware/auth.ts`

**Purpose:** Validates Supabase JWT tokens and extracts user identity.

**Flow:**
1. Extracts the `Authorization` header from the request
2. Validates the Bearer token format
3. Verifies the token with Supabase Admin API
4. Attaches `supabaseUserId` and `userEmail` to the request object
5. Passes control to the next middleware or rejects with 401

**Usage:**
```typescript
app.use('/api/reading', requireAuth, ensureUser, readingRoutes);
```

**Request Enhancement:**
```typescript
export interface AuthRequest extends Request {
  supabaseUserId?: string;  // Supabase user UUID
  userEmail?: string;        // User's email from Supabase
}
```

**Error Responses:**
- `401 Unauthorized` - Missing, invalid, or expired token
- `500 Internal Server Error` - Server-side authentication error

---

### 2. `ensureUser` Middleware

**Location:** `src/middleware/ensureUser.ts`

**Purpose:** Ensures a local user record exists in the Prisma database and provides the application user ID.

**Flow:**
1. Receives `supabaseUserId` from `requireAuth` middleware
2. Queries Prisma database for existing user by `supabaseuserid`
3. If user doesn't exist, creates a new user record
4. Attaches `appUserId` (local database ID) to the request object
5. Passes control to the route handler

**Usage:**
```typescript
app.use('/api/reading', requireAuth, ensureUser, readingRoutes);
```

**Request Enhancement:**
```typescript
req.appUserId: number  // Local Prisma database user ID
```

**Error Responses:**
- `401 Unauthorized` - Missing Supabase user ID (should be caught by requireAuth)
- `500 Internal Server Error` - Database operation failure

---

## Frontend Integration Guide

### Setup: Supabase Client

The frontend must initialize the Supabase client and handle authentication:

```javascript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'YOUR_SUPABASE_URL',
  'YOUR_SUPABASE_ANON_KEY'
)
```

### Authentication Flow

#### 1. User Sign-Up
```javascript
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'secure-password'
})
```

#### 2. User Sign-In
```javascript
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'secure-password'
})

// Store the session
const session = data.session
const accessToken = session.access_token
```

#### 3. Making Authenticated API Requests

**Option A: Using Fetch**
```javascript
const session = await supabase.auth.getSession()
const token = session.data.session?.access_token

const response = await fetch('http://your-backend.com/api/reading/assess', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({ /* your data */ })
})
```

**Option B: Using Axios**
```javascript
import axios from 'axios'

const session = await supabase.auth.getSession()
const token = session.data.session?.access_token

const api = axios.create({
  baseURL: 'http://your-backend.com',
  headers: {
    'Authorization': `Bearer ${token}`
  }
})

const response = await api.post('/api/reading/assess', { /* your data */ })
```

**Option C: Axios Interceptor (Recommended)**
```javascript
import axios from 'axios'

const api = axios.create({
  baseURL: 'http://your-backend.com'
})

// Automatically attach token to every request
api.interceptors.request.use(async (config) => {
  const session = await supabase.auth.getSession()
  const token = session.data.session?.access_token
  
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  
  return config
})

// Usage
const response = await api.post('/api/reading/assess', { /* your data */ })
```

#### 4. Handling Token Refresh

Supabase automatically refreshes tokens, but you should handle expired tokens:

```javascript
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Token expired, refresh session
      const { data, error: refreshError } = await supabase.auth.refreshSession()
      
      if (refreshError) {
        // Redirect to login
        window.location.href = '/login'
        return Promise.reject(refreshError)
      }
      
      // Retry the original request with new token
      const newToken = data.session?.access_token
      error.config.headers.Authorization = `Bearer ${newToken}`
      return axios.request(error.config)
    }
    
    return Promise.reject(error)
  }
)
```

#### 5. Sign Out
```javascript
const { error } = await supabase.auth.signOut()
// Clear local state and redirect to login
```

---

## Backend Configuration

### Environment Variables Required

```env
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Database
DATABASE_URL=your-prisma-database-url

# Server
PORT=4000
NODE_ENV=production
```

### CORS Configuration

The backend is configured to accept requests from specific origins:

```typescript
const allowedOrigins = [
  'http://localhost:8080',              // Development
  'https://myedtech.com',               // Production
  'https://www.myedtech.com',           // Production (www)
  'http://72.60.221.118:5000',          // VPS Frontend
]
```

**Important:** Ensure your frontend origin is in the `allowedOrigins` array.

---

## Protected Routes

Currently protected routes:
- `/api/reading/*` - Reading assessment endpoints (requires auth)

Unprotected routes:
- `/api/yt-study/*` - YouTube study material generation
- `/api/smartNotes/*` - Smart notes generation

To protect additional routes, add the middleware chain:
```typescript
app.use('/api/your-route', requireAuth, ensureUser, yourRoutes)
```

---

## Database Schema

The middleware expects a `User` model in Prisma:

```prisma
model User {
  id              Int      @id @default(autoincrement())
  supabaseuserid  String   @unique
  email           String
  createdAt       DateTime @default(now())
  // ... other fields
}
```

---

## Security Considerations

1. **Service Role Key:** The backend uses Supabase's service role key to verify tokens. This key bypasses Row Level Security (RLS) and should NEVER be exposed to the frontend.

2. **Token Validation:** Every request is validated against Supabase's auth system, ensuring tokens haven't been tampered with.

3. **Automatic User Creation:** Users are automatically created in the local database on first authenticated request, ensuring seamless onboarding.

4. **CORS Protection:** Only whitelisted origins can access the API.

5. **HTTPS in Production:** Always use HTTPS in production to prevent token interception.

---

## Error Handling

### Common Error Scenarios

| Error | Status | Cause | Solution |
|-------|--------|-------|----------|
| Missing token | 401 | No Authorization header | Ensure user is logged in and token is sent |
| Invalid token | 401 | Token expired or invalid | Refresh session or re-authenticate |
| CORS error | - | Origin not whitelisted | Add origin to allowedOrigins |
| Database error | 500 | Prisma connection issue | Check DATABASE_URL and database status |

---

## Testing Authentication

### Using cURL
```bash
# Get token from Supabase first, then:
curl -X POST http://localhost:4000/api/reading/assess \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SUPABASE_TOKEN" \
  -d '{"your": "data"}'
```

### Using Postman
1. Set request type (GET/POST)
2. Add header: `Authorization: Bearer YOUR_SUPABASE_TOKEN`
3. Add header: `Content-Type: application/json`
4. Send request

---

## Troubleshooting

### "Missing or invalid token"
- Check that the Authorization header is present
- Verify the token format: `Bearer <token>`
- Ensure the token hasn't expired

### "Invalid token"
- Token may be expired (Supabase tokens expire after 1 hour by default)
- Refresh the session on the frontend
- Verify SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are correct

### "Not allowed by CORS"
- Add your frontend origin to the `allowedOrigins` array
- Restart the backend server after changes

### User not created in database
- Check Prisma connection
- Verify the User model schema matches the middleware expectations
- Check backend logs for database errors

---

## Future Enhancements

Potential improvements to consider:

1. **Role-Based Access Control (RBAC):** Add user roles and permissions
2. **Rate Limiting:** Prevent abuse with request throttling
3. **Token Caching:** Cache validated tokens to reduce Supabase API calls
4. **Audit Logging:** Track authentication events for security monitoring
5. **Multi-Factor Authentication:** Add MFA support through Supabase

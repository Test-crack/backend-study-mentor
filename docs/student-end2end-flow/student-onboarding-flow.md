# Student Onboarding Flow - End-to-End Documentation

## Overview
This document outlines the complete backend process for student onboarding in the TestCrack platform, including authentication, enrollment, and initial setup.

---

## 1. Onboarding Initiation

### Entry Point: Institute Admin Dashboard
**Endpoint:** `POST /api/institute-admin/students`

**Request Body:**
```json
{
  "studentName": "John Doe",
  "studentEmail": "john.doe@example.com"
}
```

**Process Flow:**

### Step 1: Validation & Authorization
- Institute Admin/Owner must be authenticated (`requireAuth` middleware)
- System validates that the caller is part of an institute
- Checks if `studentName` and `studentEmail` are provided

### Step 2: Duplicate Check
The system performs two checks:

**A. Email Already Exists?**
```typescript
let dbUser = await prisma.user.findUnique({ where: { email: studentEmail } });
```

If user exists:
- ✅ **Role is STUDENT**: Proceed to enrollment check
- ❌ **Role is NOT STUDENT**: Return `409 Conflict` - "Email already linked with existing user"

**B. Already Enrolled in Institute?**
```typescript
const alreadyEnrolled = await prisma.institute_students.findFirst({
  where: { user_id: dbUser.id, institute_id: instituteId }
});
```

If already enrolled:
- ❌ Return `409 Conflict` - "This student is already enrolled in your institute"

---

## 2. Supabase Invitation

### Step 3: Send Invite Email
```typescript
const { data: inviteData, error: inviteError } = 
  await supabaseAdmin.auth.admin.inviteUserByEmail(
    studentEmail,
    {
      data: { full_name: studentName, role: 'STUDENT' },
      redirectTo: `${process.env.FRONTEND_URL}/login`
    }
  );
```

**What Happens:**
- Supabase creates an auth user (if doesn't exist)
- Sends a magic link email to the student
- Email contains a link to set password and access the platform
- Returns `supabaseUserId` for linking

**Error Handling:**
- If error message includes "already been registered", the process continues
- Other errors are thrown and handled

---

## 3. Database User Creation

### Step 4: Create/Update User Record

**If User Doesn't Exist:**
```typescript
dbUser = await prisma.user.create({
  data: {
    email: studentEmail,
    name: studentName,
    role: UserRoleType.STUDENT,
    supabaseuserid: supabaseUserId ?? `pending-${Date.now()}`
  }
});
```

**User Table Schema:**
```prisma
model User {
  id                String       @id @default(uuid)
  supabaseuserid    String       @unique
  email             String       @unique
  name              String?
  role              UserRoleType @default(STUDENT)
  profileImage      String?
  phoneNo           String?
  countryCode       String?
  createdAt         DateTime     @default(now())
  updatedAt         DateTime     @default(now())
}
```

---

## 4. Institute Enrollment

### Step 5: Link Student to Institute
```typescript
await prisma.institute_students.upsert({
  where: { user_id: dbUser.id },
  update: { institute_id: instituteId, is_active: true },
  create: { user_id: dbUser.id, institute_id: instituteId }
});
```

**institute_students Table Schema:**
```prisma
model institute_students {
  id                   String    @id @default(uuid)
  user_id              String    @unique
  institute_id         String
  enrollment_date      DateTime  @default(CURRENT_DATE)
  is_active            Boolean   @default(true)
  isDiagnosed          Boolean   @default(false)
  recommendationSeeded Boolean   @default(false)
  target_band          Float?
  momentum_score       Int       @default(0)
  daily_streak         Int       @default(0)
  last_streak_date     DateTime?
  extra_drill_credits  Int       @default(0)
  created_at           DateTime  @default(now())
  updated_at           DateTime  @default(now())
}
```

**Initial State:**
- `is_active`: `true`
- `isDiagnosed`: `false` (student hasn't taken diagnostic test)
- `recommendationSeeded`: `false` (no AI recommendations yet)
- `momentum_score`: `0`
- `daily_streak`: `0`
- `extra_drill_credits`: `0`

---

## 5. Student Receives Email & Sets Password

### Step 6: Student Email Flow
1. Student receives Supabase invite email
2. Clicks the magic link
3. Redirected to frontend login page
4. Sets their password
5. Supabase auth user is now fully activated

---

## 6. First Login - Authentication Flow

### Step 7: Student Logs In
**Frontend sends:** `Authorization: Bearer <supabase_jwt_token>`

### Middleware Chain:
```
requireAuth → ensureUser → authorize(STUDENT)
```

#### A. `requireAuth` Middleware
```typescript
// Validates Supabase JWT token
const { data, error } = await supabaseAdmin.auth.getUser(token);

// Extracts:
req.supabaseUserId = data.user.id;
req.userEmail = data.user.email;
req.userMetadata = data.user.user_metadata;
```

#### B. `ensureUser` Middleware
```typescript
// 1. Find user by Supabase ID
let user = await prisma.user.findUnique({
  where: { supabaseuserid: supabaseUserId }
});

// 2. If not found, try by email (account linking)
if (!user && email) {
  const existingUserByEmail = await prisma.user.findUnique({
    where: { email }
  });
  
  if (existingUserByEmail) {
    // Link existing user to new Supabase ID
    user = await prisma.user.update({
      where: { id: existingUserByEmail.id },
      data: { supabaseuserid: supabaseUserId }
    });
  }
}

// 3. If still no user, create new one
if (!user) {
  user = await prisma.user.create({
    data: {
      supabaseuserid: supabaseUserId,
      email: email ?? `no-email-${supabaseUserId}@placeholder.local`,
      name: metadata.full_name || undefined,
      profileImage: metadata.avatar_url || undefined
    }
  });
}

// Attach to request
req.appUserId = user.id;
req.userRole = user.role;
```

#### C. `authorize(STUDENT)` Middleware
- Verifies `req.userRole === UserRoleType.STUDENT`
- Blocks access if role doesn't match

---

## 7. Student Dashboard Access

### Available Endpoints After Login:

#### Student Profile & Batches
- `GET /api/student/batches` - View enrolled batches with instructors
- `GET /api/student/competency-scores` - View competency matrix
- `GET /api/student/speaking-history` - Past analytics

#### Learning & Practice
- `GET /api/student/next-action-drill` - Next prioritized drill
- `GET /api/student/daily-drill-state` - Lock/unlock state for the day
- `GET /api/student/lexigrid-words?difficulty=INTERMEDIATE` - Daily word set
- `POST /api/student/game-score` - Record LexiGrid completion

#### Recommendations
- `GET /api/student/recommendations` - AI recommendations
- `GET /api/student/drill-recommendation?skill=X&sub_skill=Y` - Specific drill recommendations

---

## 8. Batch Assignment (Optional)

### Step 8: Admin Assigns Student to Batch
**Endpoint:** `POST /api/institute-admin/batches/:id/students`

**Request Body:**
```json
{
  "userId": "student-uuid"
}
```

**Process:**
```typescript
await prisma.ielts_batch_students.create({
  data: {
    batch_id: batchId,
    user_id: userId,
    enrolled_at: new Date()
  }
});
```

**ielts_batch_students Table:**
```prisma
model ielts_batch_students {
  id          String   @id @default(uuid)
  batch_id    String
  user_id     String
  enrolled_at DateTime @default(now())
  
  @@unique([batch_id, user_id])
}
```

---

## 9. Complete Onboarding Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Institute Admin Enrolls Student                              │
│    POST /api/institute-admin/students                           │
│    { studentName, studentEmail }                                │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. System Checks                                                 │
│    ✓ Email exists?                                              │
│    ✓ Already enrolled?                                          │
│    ✓ Role conflict?                                             │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. Supabase Invitation                                          │
│    - Create auth user                                           │
│    - Send magic link email                                      │
│    - Get supabaseUserId                                         │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. Create User Record                                           │
│    - Insert into User table                                     │
│    - role: STUDENT                                              │
│    - Link supabaseUserId                                        │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. Institute Enrollment                                         │
│    - Insert into institute_students                             │
│    - is_active: true                                            │
│    - isDiagnosed: false                                         │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. Student Receives Email                                       │
│    - Clicks magic link                                          │
│    - Sets password                                              │
│    - Account activated                                          │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ 7. First Login                                                  │
│    - Frontend sends JWT token                                   │
│    - requireAuth validates token                                │
│    - ensureUser links/creates User record                       │
│    - authorize checks STUDENT role                              │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ 8. Access Student Dashboard                                     │
│    - View batches                                               │
│    - Access drills                                              │
│    - Get recommendations                                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 10. Identified Issues & Bugs

### 🐛 Issue #1: Pending Supabase ID
**Location:** `instituteAdminController.ts:127`
```typescript
supabaseuserid: supabaseUserId ?? `pending-${Date.now()}`
```

**Problem:**
- If Supabase invite fails, a temporary ID is created
- This ID will never be updated when student actually signs up
- Student won't be able to log in

**Recommendation:**
- Don't create User record if Supabase invite fails
- Return error to admin to retry
- Or implement a webhook to update the ID when student accepts invite

---

### 🐛 Issue #2: No Email Verification Status
**Problem:**
- System doesn't track if student has accepted the invite
- Admin can't see if student has set their password
- No way to resend invite if email was missed

**Recommendation:**
- Add `email_verified` field to User table
- Add `invite_status` field: `PENDING`, `ACCEPTED`, `EXPIRED`
- Add endpoint to resend invite

---

### 🐛 Issue #3: Duplicate User Creation Risk
**Location:** `ensureUser.ts:67-75`

**Problem:**
- If student signs up via Google OAuth before accepting institute invite
- Two User records could be created (one by admin, one by OAuth)
- Email linking logic exists but could fail in race conditions

**Recommendation:**
- Make email the primary unique identifier
- Always check by email first, then link Supabase ID
- Add transaction wrapper for user creation

---

### 🐛 Issue #4: No Onboarding Status Tracking
**Problem:**
- System doesn't track onboarding completion steps
- Can't tell if student has:
  - Completed profile
  - Taken diagnostic test
  - Viewed tutorial
  - Started first drill

**Recommendation:**
- Add `onboarding_status` JSONB field to `institute_students`
```json
{
  "profile_completed": false,
  "diagnostic_taken": false,
  "tutorial_viewed": false,
  "first_drill_completed": false
}
```

---

### 🐛 Issue #5: Missing Student Activation Notification
**Problem:**
- Admin doesn't get notified when student accepts invite
- No webhook from Supabase to track student activation

**Recommendation:**
- Implement Supabase webhook for `user.created` event
- Update `institute_students.is_active` when student logs in first time
- Send notification to admin

---

### 🐛 Issue #6: No Rollback on Partial Failure
**Problem:**
- If Supabase invite succeeds but DB insert fails
- Student receives email but has no account in system
- If DB insert succeeds but Supabase fails
- Student exists in DB but can't log in

**Recommendation:**
- Wrap entire process in try-catch with rollback
- Use database transactions
- Implement idempotency for retry safety

---

### ⚠️ Issue #7: Hardcoded Redirect URL
**Location:** `instituteAdminController.ts:113`
```typescript
redirectTo: `${process.env.FRONTEND_URL ?? 'http://localhost:8080'}/login`
```

**Problem:**
- All students redirected to generic login page
- No context about which institute they're joining
- No pre-filled information

**Recommendation:**
- Include institute ID in redirect URL
- Create dedicated onboarding page
```typescript
redirectTo: `${process.env.FRONTEND_URL}/onboarding?institute=${instituteId}&email=${studentEmail}`
```

---

### 🐛 Issue #8: No Rate Limiting on Student Addition
**Problem:**
- Admin can spam student invites
- No protection against accidental bulk invites
- Could hit Supabase rate limits

**Recommendation:**
- Add rate limiting middleware
- Implement bulk invite endpoint with confirmation
- Add daily invite quota per institute

---

## 11. Recommended Improvements

### A. Add Onboarding Checklist API
```typescript
GET /api/student/onboarding-status
Response:
{
  "completed": false,
  "steps": {
    "profile_setup": { "completed": true, "completedAt": "2024-01-15" },
    "diagnostic_test": { "completed": false },
    "tutorial": { "completed": false },
    "first_drill": { "completed": false }
  }
}
```

### B. Add Resend Invite Endpoint
```typescript
POST /api/institute-admin/students/:userId/resend-invite
```

### C. Add Student Activation Webhook
```typescript
POST /api/webhooks/supabase/user-activated
Body: { userId, email, timestamp }
```

### D. Add Bulk Student Import
```typescript
POST /api/institute-admin/students/bulk
Body: {
  students: [
    { name: "John Doe", email: "john@example.com" },
    { name: "Jane Smith", email: "jane@example.com" }
  ]
}
```

### E. Add Student Onboarding Analytics
```typescript
GET /api/institute-admin/analytics/onboarding
Response: {
  "total_invited": 50,
  "activated": 35,
  "pending": 15,
  "avg_activation_time": "2.5 days"
}
```

---

## 12. Testing Checklist

### Manual Testing Steps:

#### ✅ Happy Path
1. Admin enrolls student with valid email
2. Student receives email
3. Student clicks link and sets password
4. Student logs in successfully
5. Student sees dashboard

#### ✅ Edge Cases
1. Enroll student with existing email (different role)
2. Enroll same student twice
3. Supabase invite fails
4. Database insert fails
5. Student never accepts invite
6. Student signs up via OAuth before accepting invite

#### ✅ Security Testing
1. Non-admin tries to enroll student
2. Admin from Institute A tries to enroll in Institute B
3. Invalid email format
4. SQL injection in student name/email
5. Rate limiting on bulk invites

---

## 13. Database Queries for Debugging

### Check Student Enrollment Status
```sql
SELECT 
  u.id,
  u.email,
  u.name,
  u.role,
  u.supabaseuserid,
  ist.is_active,
  ist.isDiagnosed,
  ist.enrollment_date,
  i.name as institute_name
FROM "User" u
JOIN institute_students ist ON u.id = ist.user_id
JOIN institutes i ON ist.institute_id = i.id
WHERE u.email = 'student@example.com';
```

### Find Students with Pending Supabase IDs
```sql
SELECT id, email, name, supabaseuserid
FROM "User"
WHERE supabaseuserid LIKE 'pending-%';
```

### Check Batch Assignments
```sql
SELECT 
  u.name,
  u.email,
  b.name as batch_name,
  bs.enrolled_at
FROM "User" u
JOIN ielts_batch_students bs ON u.id = bs.user_id
JOIN ielts_batches b ON bs.batch_id = b.id
WHERE u.id = 'student-uuid';
```

---

## 14. Environment Variables Required

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Frontend
FRONTEND_URL=https://testcrack.com

# Database
DATABASE_URL=postgresql://user:password@host:5432/dbname
```

---

## 15. Next Steps for Testing

1. **Create Test Institute & Admin**
   - Use superadmin endpoint to create test institute
   - Create test admin user

2. **Test Student Enrollment**
   - Use Postman/Thunder Client to call enrollment endpoint
   - Verify email is sent (check Supabase dashboard)
   - Check database records

3. **Test Student Login**
   - Accept invite email
   - Set password
   - Login via frontend
   - Verify JWT token works

4. **Test Batch Assignment**
   - Create test batch
   - Assign student to batch
   - Verify student can see batch

5. **Test Edge Cases**
   - Duplicate enrollment
   - Invalid emails
   - Role conflicts

---

## Summary

The student onboarding flow is functional but has several areas for improvement:

**✅ Working:**
- Basic enrollment via admin
- Supabase email invites
- User creation and linking
- Authentication flow
- Role-based access control

**⚠️ Needs Attention:**
- Pending Supabase ID handling
- Onboarding status tracking
- Email verification status
- Rollback on partial failures
- Rate limiting
- Admin notifications

**🚀 Recommended Enhancements:**
- Onboarding checklist API
- Resend invite functionality
- Bulk student import
- Activation webhooks
- Analytics dashboard

# QA Test Users

Real, loginable Supabase accounts for manual testing. No signup/OTP needed — just log in with these directly.

Institute: **IIIT Kottayam** | Batch: **ielts evening** (`8ffc2070-7f9b-4853-8938-a3ff5a676521`)

## Students

All 8 are enrolled in the institute and added to the **ielts evening** batch.

| # | Full Name | Email | Password |
|---|-----------|-------|----------|
| 1 | QA Tester One | qa.tester1@testcrack.dev | TestUser@123 |
| 2 | QA Tester Two | qa.tester2@testcrack.dev | TestUser@123 |
| 3 | QA Tester Three | qa.tester3@testcrack.dev | TestUser@123 |
| 4 | QA Tester Four | qa.tester4@testcrack.dev | TestUser@123 |
| 5 | QA Tester Five | qa.tester5@testcrack.dev | TestUser@123 |
| 6 | QA Tester Six | qa.tester6@testcrack.dev | TestUser@123 |
| 7 | QA Tester Seven | qa.tester7@testcrack.dev | TestUser@123 |
| 8 | QA Tester Eight | qa.tester8@testcrack.dev | TestUser@123 |

Each account starts with no diagnostic/drill/IA data — logging in for the first time creates a fresh, empty student profile.

## Tutor

| Full Name | Email | Password | Specialization |
|-----------|-------|----------|-----------------|
| QA Tutor | qa.tutor1@testcrack.dev | TestTutor@123 | IELTS Preparation |

Pre-linked to the institute (`institute_instructors`) so it's ready to be picked when allocating a tutor to a batch via the website.

## Managing these accounts

Scripts live in `scripts/seeders/`:

```bash
# students — create / delete the 8 Supabase logins
npx ts-node --project tsconfig.dev.json scripts/seeders/createTestUsers.ts
npx ts-node --project tsconfig.dev.json scripts/seeders/createTestUsers.ts --delete

# tutor — create / delete (requires a batch UUID to resolve the institute)
npx ts-node --project tsconfig.dev.json scripts/seeders/createTestTutor.ts --batch 8ffc2070-7f9b-4853-8938-a3ff5a676521
npx ts-node --project tsconfig.dev.json scripts/seeders/createTestTutor.ts --batch 8ffc2070-7f9b-4853-8938-a3ff5a676521 --delete

# enroll all 8 students into a batch + set tutor specialization
npx ts-node --project tsconfig.dev.json scripts/seeders/enrollQaTestersInBatch.ts --batch 8ffc2070-7f9b-4853-8938-a3ff5a676521
```

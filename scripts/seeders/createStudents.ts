/**
 * TC-01 + TC-02: Create User rows directly in PostgreSQL (no Supabase auth),
 * then enroll each student in the target institute + batch.
 *
 * Why no Supabase: seed emails are fake (@seed.testcrack.dev) so Supabase OTP
 * confirmation would fail. We bypass auth entirely for demo data.
 */

import prisma from '../../src/lib/prisma';
import { PERSONAS, SEED_EMAIL_DOMAIN } from './personas';
import { fakeSupabaseId, yesterday } from './utils';

export interface StudentRecord {
  personaEmail: string;
  userId: string;           // User.id (UUID)
  studentId: string;        // institute_students.id (UUID)
}

export async function createStudents(
  batchId: string,
  dryRun: boolean
): Promise<StudentRecord[]> {
  console.log('\n[createStudents] START');

  // Resolve institute_id from the batch so we can enroll into the right institute.
  const batch = await prisma.ielts_batches.findUnique({ where: { id: batchId } });
  if (!batch) throw new Error(`Batch ${batchId} not found. Ask Sarthak for a valid batchId.`);
  const instituteId = batch.institute_id;

  const records: StudentRecord[] = [];

  for (const persona of PERSONAS) {
    const maxBand = Math.max(...Object.values(persona.diagnosticBand));
    const targetBand = Math.min(9.0, maxBand + persona.targetBandOffset);

    // ── Dry-run: log all three steps and push a placeholder record so the
    // downstream seeders (diagnostics/drills/IA) can also preview their inserts. ──
    if (dryRun) {
      console.log(`  [DRY-RUN] Would create User: ${persona.name} <${persona.email}>`);
      console.log(`  [DRY-RUN] Would enroll in institute (target band: ${targetBand}, momentum: ${persona.momentumScore}, streak: ${persona.dailyStreak})`);
      console.log(`  [DRY-RUN] Would add ${persona.email} to batch ${batchId}`);
      records.push({ personaEmail: persona.email, userId: `dry-run:${persona.email}`, studentId: `dry-run:${persona.email}` });
      continue;
    }

    // ── Step 1: Upsert User ──────────────────────────────────────────────────
    const existing = await prisma.user.findUnique({ where: { email: persona.email } });

    let userId: string;
    if (existing) {
      console.log(`  [SKIP] User already exists: ${persona.email}`);
      userId = existing.id;
    } else {
      const user = await prisma.user.create({
        data: {
          supabaseuserid: fakeSupabaseId(persona.email),
          email: persona.email,
          name: persona.name,
          role: 'STUDENT',
        },
      });
      userId = user.id;
      console.log(`  [OK] Created User: ${persona.name} → ${userId}`);
    }

    // ── Step 2: Upsert institute_students ────────────────────────────────────
    // momentum_score / daily_streak / last_streak_date are seeded directly so the
    // instructor at-risk widget separates strugglers (atRisk) from high performers.
    const existingStudent = await prisma.institute_students.findUnique({
      where: { user_id: userId },
    });

    let studentId: string;
    if (existingStudent) {
      console.log(`  [SKIP] institute_students already exists for ${persona.email}`);
      studentId = existingStudent.id;
    } else {
      const student = await prisma.institute_students.create({
        data: {
          user_id: userId,
          institute_id: instituteId,
          target_band: targetBand,
          momentum_score: persona.momentumScore,
          daily_streak: persona.dailyStreak,
          last_streak_date: persona.atRisk ? null : yesterday(),
        },
      });
      studentId = student.id;
      console.log(`  [OK] Enrolled in institute: ${persona.name} → studentId ${studentId}`);
    }

    // ── Step 3: Upsert ielts_batch_students ──────────────────────────────────
    const existingBatchEnroll = await prisma.ielts_batch_students.findUnique({
      where: { batch_id_user_id: { batch_id: batchId, user_id: userId } },
    });

    if (existingBatchEnroll) {
      console.log(`  [SKIP] Already in batch: ${persona.email}`);
    } else {
      await prisma.ielts_batch_students.create({
        data: { batch_id: batchId, user_id: userId },
      });
      console.log(`  [OK] Added to batch: ${persona.name}`);
    }

    records.push({ personaEmail: persona.email, userId, studentId });
  }

  console.log(`[createStudents] DONE — ${records.length} students ready\n`);
  return records;
}

// ── Cleanup helper used by --clean flag and cleanSeed.ts ──────────────────────
// dryRun=true lists what WOULD be deleted without deleting (safe preview).
export async function cleanStudents(dryRun = false): Promise<void> {
  console.log('\n[cleanStudents] Scanning for seed accounts...');
  const users = await prisma.user.findMany({
    where: { email: { endsWith: SEED_EMAIL_DOMAIN } },
    select: { id: true, email: true },
  });

  if (users.length === 0) {
    console.log(`  No accounts ending in ${SEED_EMAIL_DOMAIN} found. Nothing to delete.\n`);
    return;
  }

  console.log(`  Found ${users.length} seed account(s) (email ending ${SEED_EMAIL_DOMAIN}):`);
  for (const u of users) console.log(`    - ${u.email}`);

  if (dryRun) {
    console.log(`  [PREVIEW] Nothing deleted. Re-run with --confirm to delete these.\n`);
    return;
  }

  for (const u of users) {
    // Cascades handle institute_students, batch enrollment, and all assessment data.
    await prisma.user.delete({ where: { id: u.id } });
    console.log(`  [DELETED] ${u.email}`);
  }
  console.log(`[cleanStudents] DONE — removed ${users.length} users\n`);
}

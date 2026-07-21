/**
 * ONE-OFF: enroll all 8 qa.tester@testcrack.dev accounts into a batch (institute
 * enrollment + batch enrollment, mirroring addStudent + addStudentToBatch), and
 * set the qa.tutor1 specialization.
 *
 * Usage:
 *   npx ts-node --project tsconfig.dev.json scripts/seeders/enrollQaTestersInBatch.ts --batch <batchId>
 */
import dotenv from 'dotenv';
dotenv.config();

import { Command } from 'commander';
import prisma from '../../src/lib/prisma';
import { supabaseAdmin } from '../../src/lib/supabase';

const program = new Command();
program.name('enrollQaTestersInBatch').requiredOption('--batch <batchId>');
program.parse(process.argv);
const opts = program.opts<{ batch: string }>();

const TESTER_EMAILS = Array.from({ length: 8 }, (_, i) => `qa.tester${i + 1}@testcrack.dev`);
const TUTOR_EMAIL = 'qa.tutor1@testcrack.dev';

async function main() {
  const batch = await prisma.ielts_batches.findUnique({ where: { id: opts.batch } });
  if (!batch) throw new Error(`Batch ${opts.batch} not found.`);
  const instituteId = batch.institute_id;

  const { data: authList, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
  if (listErr) throw new Error(`listUsers failed: ${listErr.message}`);

  for (const email of TESTER_EMAILS) {
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      const authUser = authList.users.find((u) => u.email === email);
      if (!authUser) { console.log(`[MISS] ${email} — no Supabase account (run createTestUsers.ts first)`); continue; }
      user = await prisma.user.create({
        data: { email, supabaseuserid: authUser.id, role: 'STUDENT', name: email.split('@')[0] },
      });
      console.log(`[CREATED] User row for ${email}`);
    }

    let student = await prisma.institute_students.findUnique({ where: { user_id: user.id } });
    if (!student) {
      student = await prisma.institute_students.create({
        data: { user_id: user.id, institute_id: instituteId, is_active: true },
      });
      console.log(`[ENROLLED] ${email} -> institute ${instituteId}`);
    } else if (student.institute_id !== instituteId) {
      console.log(`[SKIP] ${email} already enrolled at a different institute (${student.institute_id})`);
      continue;
    } else {
      console.log(`[OK] ${email} already in this institute`);
    }

    const existingBatchLink = await prisma.ielts_batch_students.findUnique({
      where: { batch_id_user_id: { batch_id: opts.batch, user_id: user.id } },
    });
    if (existingBatchLink) {
      console.log(`  [SKIP] already in batch`);
    } else {
      await prisma.ielts_batch_students.create({ data: { batch_id: opts.batch, user_id: user.id } });
      console.log(`  [ADDED] to batch ${batch.batch_name ?? opts.batch}`);
    }
  }

  // ── Tutor specialization ────────────────────────────────────────────────
  const tutorUser = await prisma.user.findUnique({ where: { email: TUTOR_EMAIL } });
  if (tutorUser) {
    const updated = await prisma.institute_instructors.updateMany({
      where: { user_id: tutorUser.id },
      data: { specialization: 'IELTS Preparation' },
    });
    console.log(`\n[TUTOR] ${TUTOR_EMAIL} specialization set to "IELTS Preparation" (${updated.count} row updated)`);
  } else {
    console.log(`\n[MISS] ${TUTOR_EMAIL} not found — run createTestTutor.ts first`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

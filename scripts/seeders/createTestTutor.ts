/**
 * Creates a real, loginable Supabase tutor account (INSTRUCTOR role) pre-linked
 * to an institute via institute_instructors — so it shows up ready to pick in
 * the website's "allocate tutor to batch" flow (see batchController.ts's
 * isInstructor check, which requires an institute_instructors row to exist).
 *
 * Unlike the real addTutor endpoint (instituteAdminController.ts), which sends a
 * Supabase magic-link invite email, this sets a real password directly
 * (email_confirm: true) so you can log in immediately without an inbox.
 *
 * Usage:
 *   npx ts-node --project tsconfig.dev.json scripts/seeders/createTestTutor.ts --batch <batchId>
 *   npx ts-node --project tsconfig.dev.json scripts/seeders/createTestTutor.ts --batch <batchId> --delete
 */
import dotenv from 'dotenv';
dotenv.config();

import { Command } from 'commander';
import { supabaseAdmin } from '../../src/lib/supabase';
import prisma from '../../src/lib/prisma';

const program = new Command();
program
  .name('createTestTutor')
  .requiredOption('--batch <batchId>', 'UUID of the target IELTS batch (resolves the institute)')
  .option('--delete', 'delete the test tutor instead of creating it', false);
program.parse(process.argv);
const opts = program.opts<{ batch: string; delete: boolean }>();

const EMAIL = 'qa.tutor1@testcrack.dev';
const PASSWORD = 'TestTutor@123';
const NAME = 'QA Tutor';

async function createTutor() {
  const batch = await prisma.ielts_batches.findUnique({ where: { id: opts.batch } });
  if (!batch) throw new Error(`Batch ${opts.batch} not found.`);
  const instituteId = batch.institute_id;

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error && !/already|registered|exists/i.test(error.message)) {
    throw new Error(`createUser failed: ${error.message}`);
  }

  let dbUser = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (!dbUser) {
    dbUser = await prisma.user.create({
      data: {
        email: EMAIL,
        name: NAME,
        role: 'INSTRUCTOR',
        supabaseuserid: data?.user?.id ?? `pending-${Date.now()}`,
      },
    });
    console.log(`CREATED User: ${EMAIL}`);
  } else if (dbUser.role !== 'INSTRUCTOR') {
    console.error(`FAILED: ${EMAIL} already exists with role ${dbUser.role}, not INSTRUCTOR.`);
    return;
  } else {
    console.log(`EXISTS  User: ${EMAIL}`);
  }

  await prisma.institute_instructors.upsert({
    where: { user_id: dbUser.id },
    update: { institute_id: instituteId },
    create: { user_id: dbUser.id, institute_id: instituteId },
  });

  console.log(`\nTutor ready — login: ${EMAIL} / ${PASSWORD}`);
  console.log(`Linked to institute ${instituteId}. Go allocate them to a batch via the website.`);
}

async function deleteTutor() {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers();
  if (error) throw new Error(`listUsers failed: ${error.message}`);
  const match = data.users.find((u) => u.email === EMAIL);
  if (match) {
    const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(match.id);
    if (delErr) throw new Error(`deleteUser failed: ${delErr.message}`);
  }
  await prisma.user.deleteMany({ where: { email: EMAIL } }); // cascades institute_instructors
  console.log(`DELETED ${EMAIL}`);
}

async function main() {
  if (opts.delete) await deleteTutor();
  else await createTutor();
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

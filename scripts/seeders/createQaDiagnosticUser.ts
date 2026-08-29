/**
 * One-off QA test user for manually testing the diagnostic flow.
 * Real, loginable Supabase account + institute_students row + enrolled in the
 * smallest batch — ready to use immediately, no login-first step needed.
 *
 * Usage:
 *   npx ts-node --project tsconfig.dev.json scripts/seeders/createQaDiagnosticUser.ts
 *   npx ts-node --project tsconfig.dev.json scripts/seeders/createQaDiagnosticUser.ts --delete
 */
import 'dotenv/config';
import { supabaseAdmin } from '../../src/lib/supabase';
import prisma from '../../src/lib/prisma';

const EMAIL = 'qa.speaking1@testcrack.dev';
const PASSWORD = 'TestUser@123';
// Defaults target dev's IIIT Kottayam / ielts evening. Override via env for prod:
//   INSTITUTE_ID=4176203f-e1e6-46b9-86e0-f53137414e89 BATCH_ID=0495e939-116d-4b5d-9cd5-51c6ef0e6c92
const INSTITUTE_ID = process.env.QA_INSTITUTE_ID || '8691e6ae-937b-4d2f-876c-60984febe40e';
const BATCH_ID = process.env.QA_BATCH_ID || '8ffc2070-7f9b-4853-8938-a3ff5a676521';

async function create() {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error && !/already|registered|exists/i.test(error.message)) {
    throw new Error(`Supabase createUser failed: ${error.message}`);
  }

  let supabaseUserId = data?.user?.id;
  if (!supabaseUserId) {
    const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
    if (listErr) throw listErr;
    supabaseUserId = list.users.find((u) => u.email === EMAIL)?.id;
  }
  if (!supabaseUserId) throw new Error('Could not resolve Supabase user id');

  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: { supabaseuserid: supabaseUserId },
    create: { supabaseuserid: supabaseUserId, email: EMAIL, name: 'QA Speaking Tester', role: 'STUDENT' },
  });

  const student = await prisma.instituteStudent.upsert({
    where: { user_id: user.id },
    update: {},
    create: { user_id: user.id, institute_id: INSTITUTE_ID, is_active: true, isDiagnosed: false },
  });

  await prisma.batchStudent.upsert({
    where: { batch_id_user_id: { batch_id: BATCH_ID, user_id: user.id } },
    update: {},
    create: { batch_id: BATCH_ID, user_id: user.id },
  });

  console.log(`CREATED  ${EMAIL} / ${PASSWORD}`);
  console.log(`  User id: ${user.id}`);
  console.log(`  Student id: ${student.id}`);
  console.log(`  Institute: IIIT Kottayam, Batch: ielts evening`);
  console.log(`\nReady to log in and test diagnostic.`);
}

async function del() {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers();
  if (error) throw error;
  const match = data.users.find((u) => u.email === EMAIL);
  if (match) {
    const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(match.id);
    if (delErr) throw delErr;
    console.log(`DELETED Supabase auth user for ${EMAIL}`);
  } else {
    console.log(`SKIP    ${EMAIL} (no auth user)`);
  }
  // Cascades to institute_students, drills, IA sessions, batch enrollment, etc.
  const res = await prisma.user.deleteMany({ where: { email: EMAIL } });
  console.log(`DELETED ${res.count} Prisma User row(s) (cascaded to student data)`);
}

async function main() {
  if (process.argv.includes('--delete')) await del();
  else await create();
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

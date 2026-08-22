/**
 * Creates one real, loginable test student for manual diagnostic/speaking QA,
 * onboarded to IIIT Kottayam and enrolled in the "ielts evening" batch (had the
 * most open seats of the 3 active batches as of 2026-08-07 — re-check with
 * listBatches.ts if seats have since filled).
 *
 * Usage:
 *   npx ts-node --project tsconfig.dev.json scripts/seeders/createSpeakingTestChar.ts
 *   npx ts-node --project tsconfig.dev.json scripts/seeders/createSpeakingTestChar.ts --email custom@testcrack.dev
 */
import dotenv from 'dotenv';
dotenv.config();

import { Command } from 'commander';
import { supabaseAdmin } from '../../src/lib/supabase';
import prisma from '../../src/lib/prisma';

const BATCH_ID = '8ffc2070-7f9b-4853-8938-a3ff5a676521'; // "ielts evening" @ IIIT Kottayam
const PASSWORD = 'TestUser@123';

const program = new Command();
program
  .name('createSpeakingTestChar')
  .option('--email <email>', 'login email for the test account', 'qa.speaking1@testcrack.dev')
  .option('--name <name>', 'display name', 'Speaking QA Tester');
program.parse(process.argv);
const opts = program.opts<{ email: string; name: string }>();

async function main() {
  const batch = await prisma.ielts_batches.findUnique({ where: { id: BATCH_ID } });
  if (!batch) throw new Error(`Batch ${BATCH_ID} not found — run listBatches.ts to find a current one.`);
  if (batch.max_students != null) {
    const count = await prisma.ielts_batch_students.count({ where: { batch_id: BATCH_ID } });
    if (count >= batch.max_students) throw new Error(`Batch "${batch.name}" is full (${count}/${batch.max_students}).`);
  }

  const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email: opts.email,
    password: PASSWORD,
    email_confirm: true,
  });
  let authUserId = created?.user?.id;
  if (createErr) {
    if (!/already|registered|exists/i.test(createErr.message)) throw createErr;
    const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
    if (listErr) throw listErr;
    authUserId = list.users.find((u) => u.email === opts.email)?.id;
    if (!authUserId) throw new Error(`${opts.email} reported as existing but not found in auth list.`);
    console.log(`[EXISTS] Supabase auth user ${opts.email}`);
  } else {
    console.log(`[CREATED] Supabase auth user ${opts.email} / ${PASSWORD}`);
  }

  let user = await prisma.user.findUnique({ where: { email: opts.email } });
  if (!user) {
    user = await prisma.user.create({
      data: { email: opts.email, name: opts.name, role: 'STUDENT', supabaseuserid: authUserId! },
    });
    console.log(`[CREATED] User row (id: ${user.id})`);
  } else {
    console.log(`[OK] User row already exists (id: ${user.id})`);
  }

  let student = await prisma.institute_students.findUnique({ where: { user_id: user.id } });
  if (!student) {
    student = await prisma.institute_students.create({
      data: { user_id: user.id, institute_id: batch.institute_id, is_active: true },
    });
    console.log(`[ENROLLED] institute_students row (id: ${student.id}) -> institute ${batch.institute_id}`);
  } else if (student.institute_id !== batch.institute_id) {
    throw new Error(`${opts.email} is already enrolled at a different institute (${student.institute_id}).`);
  } else {
    console.log(`[OK] Already enrolled at this institute (id: ${student.id})`);
  }

  const existingLink = await prisma.ielts_batch_students.findUnique({
    where: { batch_id_user_id: { batch_id: BATCH_ID, user_id: user.id } },
  });
  if (existingLink) {
    console.log(`[OK] Already in batch "${batch.name}"`);
  } else {
    await prisma.ielts_batch_students.create({ data: { batch_id: BATCH_ID, user_id: user.id } });
    console.log(`[ADDED] to batch "${batch.name}"`);
  }

  console.log(`\nDone. Login with:\n  email:    ${opts.email}\n  password: ${PASSWORD}`);
  console.log(`institute_students.id (student_id for resetDiagnostic.ts): ${student.id}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

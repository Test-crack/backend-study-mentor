/**
 * PROD VARIANT of createSpeakingTestChar.ts — creates one real, loginable test
 * student directly in the PRODUCTION database, for manual QA on the live site.
 * Writes ONLY new rows (User, institute_students, ielts_batch_students) via
 * direct DB access — never calls any backend API endpoint.
 *
 * Auth: uses the same Supabase Auth project as dev (SUPABASE_URL/SERVICE_ROLE_KEY
 * in your local .env) — if that project is shared with prod, this creates a real,
 * loginable account on the live site immediately.
 *
 * SAFETY: PROD_DATABASE_URL must be passed explicitly — there is no default, so
 * this can never accidentally run against your local dev DB.
 *
 * Usage:
 *   # First, see what institutes/batches exist in prod:
 *   PROD_DATABASE_URL="postgresql://testcrack_main_admin:<PW>@localhost:5432/testcrack_db_main?schema=public" \
 *     npx ts-node --project tsconfig.dev.json scripts/seeders/createTestCharProd.ts --list
 *
 *   # Then create the account in a specific batch:
 *   PROD_DATABASE_URL="postgresql://testcrack_main_admin:<PW>@localhost:5432/testcrack_db_main?schema=public" \
 *     npx ts-node --project tsconfig.dev.json scripts/seeders/createTestCharProd.ts --batch <BATCH_UUID>
 *
 * To remove afterwards, run removeQaStudent.ts (or delete manually) against the
 * SAME PROD_DATABASE_URL, and delete the Supabase auth user via the dashboard
 * or supabaseAdmin.auth.admin.deleteUser.
 */
import dotenv from 'dotenv';
dotenv.config();

import { Command } from 'commander';
import { PrismaClient } from '@prisma/client';
import { supabaseAdmin } from '../../src/lib/supabase';

const PROD_URL = process.env.PROD_DATABASE_URL;
if (!PROD_URL) throw new Error('PROD_DATABASE_URL must be set explicitly (no default — this writes to production).');

const prod = new PrismaClient({ datasources: { db: { url: PROD_URL } } });

const PASSWORD = 'TestUser@123';

function hostLabel(url: string): string {
  try { const u = new URL(url); return `${u.host}${u.pathname}`; } catch { return '(unparseable)'; }
}

const program = new Command();
program
  .name('createTestCharProd')
  .option('--list', 'list institutes/batches in prod and exit (no writes)', false)
  .option('--batch <batchId>', 'batch UUID to enroll the test student into')
  .option('--email <email>', 'login email for the test account', 'qa.speaking1@testcrack.dev')
  .option('--name <name>', 'display name', 'Speaking QA Tester');
program.parse(process.argv);
const opts = program.opts<{ list: boolean; batch?: string; email: string; name: string }>();

async function listBatches() {
  const batches = await prod.ielts_batches.findMany({
    orderBy: { created_at: 'desc' },
    include: { institutes: { select: { name: true } }, _count: { select: { ielts_batch_students: true } } },
  });
  if (batches.length === 0) { console.log('No batches found in prod.'); return; }
  console.log(`\nFound ${batches.length} batch(es) in PROD:\n`);
  for (const b of batches) {
    console.log(`  ${b.name}  [${b.status}]`);
    console.log(`    UUID:      ${b.id}`);
    console.log(`    Institute: ${b.institutes?.name ?? 'unknown'}`);
    console.log(`    Students:  ${b._count.ielts_batch_students}${b.max_students != null ? ` / ${b.max_students}` : ''}`);
    console.log('');
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log(`  createTestCharProd — target: ${hostLabel(PROD_URL!)}`);
  console.log('═══════════════════════════════════════════════════\n');

  if (opts.list) {
    await listBatches();
    return;
  }
  if (!opts.batch) {
    throw new Error('Pass --batch <batchId> (run with --list first to find one).');
  }

  const batch = await prod.ielts_batches.findUnique({ where: { id: opts.batch } });
  if (!batch) throw new Error(`Batch ${opts.batch} not found in prod — run with --list to see valid batches.`);
  if (batch.max_students != null) {
    const count = await prod.ielts_batch_students.count({ where: { batch_id: opts.batch } });
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

  let user = await prod.user.findUnique({ where: { email: opts.email } });
  if (!user) {
    user = await prod.user.create({
      data: { email: opts.email, name: opts.name, role: 'STUDENT', supabaseuserid: authUserId! },
    });
    console.log(`[CREATED] prod User row (id: ${user.id})`);
  } else {
    console.log(`[OK] prod User row already exists (id: ${user.id})`);
  }

  let student = await prod.institute_students.findUnique({ where: { user_id: user.id } });
  if (!student) {
    student = await prod.institute_students.create({
      data: { user_id: user.id, institute_id: batch.institute_id, is_active: true },
    });
    console.log(`[ENROLLED] prod institute_students row (id: ${student.id}) -> institute ${batch.institute_id}`);
  } else if (student.institute_id !== batch.institute_id) {
    throw new Error(`${opts.email} is already enrolled at a different institute in prod (${student.institute_id}).`);
  } else {
    console.log(`[OK] Already enrolled at this institute in prod (id: ${student.id})`);
  }

  const existingLink = await prod.ielts_batch_students.findUnique({
    where: { batch_id_user_id: { batch_id: opts.batch, user_id: user.id } },
  });
  if (existingLink) {
    console.log(`[OK] Already in batch "${batch.name}"`);
  } else {
    await prod.ielts_batch_students.create({ data: { batch_id: opts.batch, user_id: user.id } });
    console.log(`[ADDED] to batch "${batch.name}"`);
  }

  console.log(`\nDone. Login on the live site with:\n  email:    ${opts.email}\n  password: ${PASSWORD}`);
  console.log(`prod institute_students.id: ${student.id}`);
  console.log(`\nTo remove later: delete the prod User/institute_students rows and the Supabase auth user.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prod.$disconnect());

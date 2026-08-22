/**
 * One-off QA test user for manually testing the IA flow (e.g. the section-timer
 * fix) without touching a real student's schedule/momentum.
 *
 * Seeds enough backdated, completed drill history to satisfy the IA eligibility
 * gates (6 completed drills, avg DCS >= 40%, >= 2 days since first drill) and
 * anchors the very first drill's created_at so the given --ia-date lands exactly
 * on a real scheduled IA day for this student.
 *
 * Usage:
 *   npx ts-node --project tsconfig.dev.json scripts/seeders/createQaIAUser.ts
 *   npx ts-node --project tsconfig.dev.json scripts/seeders/createQaIAUser.ts --ia-date 2026-08-22
 *   npx ts-node --project tsconfig.dev.json scripts/seeders/createQaIAUser.ts --delete
 */
import 'dotenv/config';
import { supabaseAdmin } from '../../src/lib/supabase';
import prisma from '../../src/lib/prisma';

const EMAIL = 'qa.ia1@testcrack.dev';
const PASSWORD = 'TestUser@123';
// Same dev institute/batch as createQaDiagnosticUser.ts:
const INSTITUTE_ID = process.env.QA_INSTITUTE_ID || '8691e6ae-937b-4d2f-876c-60984febe40e';
const BATCH_ID = process.env.QA_BATCH_ID || '8ffc2070-7f9b-4853-8938-a3ff5a676521';

const IA_INTERVAL_DAYS = 3; // must match iaController.ts

function parseIaDateArg(): string {
  const idx = process.argv.indexOf('--ia-date');
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
  // Default: 2 days from now.
  const d = new Date();
  d.setDate(d.getDate() + 2);
  return d.toISOString().slice(0, 10);
}

async function create() {
  const iaDateStr = parseIaDateArg();
  const iaDate = new Date(`${iaDateStr}T00:00:00.000Z`);
  const firstDrillDate = new Date(iaDate.getTime() - IA_INTERVAL_DAYS * 24 * 60 * 60 * 1000);

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
    create: { supabaseuserid: supabaseUserId, email: EMAIL, name: 'QA IA Tester', role: 'STUDENT' },
  });

  // isDiagnosed: true — drills (and therefore IA) require the one-time diagnostic
  // to be done first; we're fabricating drill history directly, so skip it.
  // Explicit select — this dev DB is mid-migration and doesn't yet have every
  // column the full model expects (e.g. exam_type), so a bare upsert errors.
  const student = await prisma.instituteStudent.upsert({
    where: { user_id: user.id },
    update: { isDiagnosed: true },
    create: { user_id: user.id, institute_id: INSTITUTE_ID, is_active: true, isDiagnosed: true },
    select: { id: true },
  });

  await prisma.batchStudent.upsert({
    where: { batch_id_user_id: { batch_id: BATCH_ID, user_id: user.id } },
    update: {},
    create: { batch_id: BATCH_ID, user_id: user.id },
    select: { batch_id: true },
  });

  // Wipe any prior drill history from an earlier run so the schedule anchor is clean.
  await prisma.drillSession.deleteMany({ where: { student_id: student.id } });

  // 6 completed drills, all 100% correct (avg DCS 100% >= the 40% gate), all
  // backdated to the same day so that day becomes the schedule anchor.
  const subSkills: Array<{ skill: 'READING' | 'LISTENING'; sub_skill: 'READING' | 'LISTENING' }> = [
    { skill: 'READING', sub_skill: 'READING' },
    { skill: 'LISTENING', sub_skill: 'LISTENING' },
  ];
  for (let i = 0; i < 6; i++) {
    const s = subSkills[i % subSkills.length];
    await prisma.drillSession.create({
      data: {
        student_id: student.id,
        skill: s.skill as any,
        sub_skill: s.sub_skill as any,
        drill_type: 'MCQ',
        prompts_completed: 5,
        momentum_earned: 0,
        correct_answers: 5,
        total_questions: 5,
        status: 'DRILL_DONE' as any,
        created_at: firstDrillDate,
      },
    });
  }

  console.log(`CREATED  ${EMAIL} / ${PASSWORD}`);
  console.log(`  User id: ${user.id}`);
  console.log(`  Student id: ${student.id}`);
  console.log(`  First drill (schedule anchor): ${firstDrillDate.toISOString().slice(0, 10)}`);
  console.log(`  Scheduled IA date: ${iaDateStr} (ia_number 1)`);
  console.log(`\nReady to log in and start IA on ${iaDateStr}.`);
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

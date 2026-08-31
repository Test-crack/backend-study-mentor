/**
 * Resets a student's diagnostic state so they can go through the diagnostic
 * flow again from scratch: deletes their AssessmentHistory (mode=DIAGNOSTIC)
 * and StudentCompetencyMatrix rows for all 4 skills, and sets
 * institute_students.isDiagnosed back to false.
 *
 * Usage:
 *   npx ts-node --project tsconfig.dev.json scripts/seeders/resetDiagnostic.ts --email qa.speaking1@testcrack.dev
 *   npx ts-node --project tsconfig.dev.json scripts/seeders/resetDiagnostic.ts --email qa.speaking1@testcrack.dev --dry-run
 */
import dotenv from 'dotenv';
dotenv.config();

import { Command } from 'commander';
import prisma from '../../src/lib/prisma';

const program = new Command();
program
  .name('resetDiagnostic')
  .requiredOption('--email <email>', 'student login email')
  .option('--dry-run', 'show what would be deleted without deleting anything', false);
program.parse(process.argv);
const opts = program.opts<{ email: string; dryRun: boolean }>();

async function main() {
  const user = await prisma.user.findUnique({ where: { email: opts.email } });
  if (!user) throw new Error(`No User row found for ${opts.email}`);

  const student = await prisma.instituteStudent.findUnique({ where: { user_id: user.id } });
  if (!student) throw new Error(`${opts.email} has no institute_students row.`);

  const historyCount = await prisma.assessmentHistory.count({
    where: { student_id: student.id, mode: 'DIAGNOSTIC' },
  });
  const matrixCount = await prisma.studentCompetencyMatrix.count({
    where: { student_id: student.id },
  });
  const sessionCount = await prisma.diagnosticSession.count({
    where: { student_id: student.id },
  });

  console.log(`Student: ${opts.email} (institute_students.id: ${student.id})`);
  console.log(`  isDiagnosed:              ${student.isDiagnosed}`);
  console.log(`  AssessmentHistory rows:   ${historyCount} (mode=DIAGNOSTIC)`);
  console.log(`  StudentCompetencyMatrix:  ${matrixCount}`);
  console.log(`  DiagnosticSession rows:   ${sessionCount}`);

  if (opts.dryRun) {
    console.log('\n[dry-run] Nothing deleted.');
    return;
  }

  await prisma.assessmentHistory.deleteMany({ where: { student_id: student.id, mode: 'DIAGNOSTIC' } });
  await prisma.studentCompetencyMatrix.deleteMany({ where: { student_id: student.id } });
  await prisma.diagnosticSession.deleteMany({ where: { student_id: student.id } });
  await prisma.instituteStudent.update({ where: { id: student.id }, data: { isDiagnosed: false, updated_at: new Date() } });

  console.log('\n[RESET] Diagnostic history, competency matrix, diagnostic session, and isDiagnosed cleared.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

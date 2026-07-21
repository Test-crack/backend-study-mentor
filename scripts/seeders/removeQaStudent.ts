import dotenv from 'dotenv';
dotenv.config();
import prisma from '../../src/lib/prisma';

async function main() {
  const email = process.argv[2] ?? 'qa.tester1@testcrack.dev';
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) { console.log('User not found'); return; }
  const deleted = await prisma.institute_students.deleteMany({ where: { user_id: user.id } });
  console.log(`Removed ${deleted.count} institute_students row(s) for ${email}. Login + User row kept intact.`);
}
main().catch(console.error).finally(() => prisma.$disconnect());

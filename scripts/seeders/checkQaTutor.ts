import dotenv from 'dotenv';
dotenv.config();
import prisma from '../../src/lib/prisma';

async function main() {
  const user = await prisma.user.findUnique({ where: { email: 'qa.tutor1@testcrack.dev' } });
  console.log('User:', user);
  if (user) {
    const rows = await prisma.institute_instructors.findMany({ where: { user_id: user.id } });
    console.log('institute_instructors rows:', rows);
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());

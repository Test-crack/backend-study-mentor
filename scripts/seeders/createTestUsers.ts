/**
 * Creates/deletes a small batch of real, loginable Supabase auth users for manual QA.
 * Unlike the persona seeder, these are NOT written directly to the DB — they're
 * real Supabase accounts (email_confirm: true, no OTP needed). The app's
 * ensureUser middleware creates the matching Prisma User row on first login
 * (and that row cascades away when the account is deleted, via --delete).
 *
 * Usage:
 *   npx ts-node --project tsconfig.dev.json scripts/seeders/createTestUsers.ts
 *   npx ts-node --project tsconfig.dev.json scripts/seeders/createTestUsers.ts --delete
 */
import dotenv from 'dotenv';
dotenv.config();

import { supabaseAdmin } from '../../src/lib/supabase';
import prisma from '../../src/lib/prisma';

const COUNT = 8;
const PASSWORD = 'TestUser@123';
const EMAILS = Array.from({ length: COUNT }, (_, i) => `qa.tester${i + 1}@testcrack.dev`);

async function createUsers() {
  console.log('Creating test users...\n');
  for (const email of EMAILS) {
    const { error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error && !/already|registered|exists/i.test(error.message)) {
      console.error(`FAILED  ${email}: ${error.message}`);
      continue;
    }
    console.log(`${error ? 'EXISTS ' : 'CREATED'} ${email} / ${PASSWORD}`);
  }
  console.log('\nDone. Log in with any of the above via the app login form.');
}

async function deleteUsers() {
  console.log('Deleting test users...\n');
  for (const email of EMAILS) {
    const { data, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
    if (listErr) {
      console.error(`FAILED  lookup for ${email}: ${listErr.message}`);
      continue;
    }
    const match = data.users.find((u) => u.email === email);
    if (!match) {
      console.log(`SKIP    ${email} (no auth user)`);
      continue;
    }
    const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(match.id);
    if (delErr) {
      console.error(`FAILED  ${email}: ${delErr.message}`);
      continue;
    }
    // Cascades to related rows if a Prisma User row was ever created via ensureUser.
    await prisma.user.deleteMany({ where: { email } });
    console.log(`DELETED ${email}`);
  }
  console.log('\nDone.');
}

async function main() {
  if (process.argv.includes('--delete')) {
    await deleteUsers();
  } else {
    await createUsers();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

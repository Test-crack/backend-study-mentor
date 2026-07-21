/**
 * READ-ONLY report: for each seeded persona, what got seeded on which day.
 *
 * Reads actual DrillSession / IASession rows (not the persona config), grouped
 * by calendar date, so it reflects what's really in the DB right now. Useful
 * for sharing with non-engineers (e.g. Paul) to sanity-check the seed story.
 *
 * Usage:
 *   npx ts-node --project tsconfig.dev.json scripts/seeders/seedSummary.ts
 *   npx ts-node --project tsconfig.dev.json scripts/seeders/seedSummary.ts --out scripts/seeders/SEED_SUMMARY.md
 */
import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import { Command } from 'commander';
import prisma from '../../src/lib/prisma';
import { PERSONAS } from './personas';
import { dbHostLabel } from './utils';

const program = new Command();
program.name('seedSummary').option('--out <path>', 'also write markdown to this file');
program.parse(process.argv);
const outPath = program.opts().out as string | undefined;

const ymd = (d: Date) => d.toISOString().slice(0, 10);

async function main() {
  const lines: string[] = [];
  const push = (s = '') => lines.push(s);

  push(`# Seed Summary — from join date to today, per persona`);
  push(`Database: ${dbHostLabel()}`);
  push('');

  for (const persona of PERSONAS) {
    const user = await prisma.user.findUnique({ where: { email: persona.email } });
    const student = user && await prisma.institute_students.findUnique({ where: { user_id: user.id } });
    if (!user || !student) {
      push(`## ${persona.name} — not seeded`);
      push('');
      continue;
    }

    const diagnostics = await prisma.assessmentHistory.findMany({
      where: { student_id: student.id, mode: 'DIAGNOSTIC' },
      orderBy: { created_at: 'asc' },
    });
    const drills = await prisma.drillSession.findMany({
      where: { student_id: student.id },
      orderBy: { created_at: 'asc' },
    });
    const ias = await prisma.iASession.findMany({
      where: { student_id: student.id },
      orderBy: { ia_date: 'asc' },
    });

    // Group events by date
    const byDate = new Map<string, string[]>();
    const joinKey = ymd(user.createdAt);
    if (diagnostics.length) {
      byDate.set(joinKey, [
        ...(byDate.get(joinKey) ?? []),
        `Joined + completed diagnostic: ${diagnostics.map((d) => `${d.skill} ${d.band_score}`).join(', ')}`,
      ]);
      // Surface actual W/S feedback prose so it's visible whether it's real Gemini
      // grading (seeders-ai) or templated boilerplate (seeders) — same DB shape either way.
      for (const d of diagnostics) {
        if (d.skill !== 'WRITING' && d.skill !== 'SPEAKING') continue;
        const fb = (d.sub_scores as any)?.feedback;
        const snippet = fb?.priority_action || fb?.fluency?.score_rationale || fb?.task_response?.score_rationale;
        if (snippet) {
          byDate.set(joinKey, [...(byDate.get(joinKey) ?? []), `  ↳ ${d.skill} feedback: "${snippet}"`]);
        }
      }
    } else {
      byDate.set(joinKey, [...(byDate.get(joinKey) ?? []), 'Joined (no diagnostic found)']);
    }
    for (const d of drills) {
      const key = ymd(d.created_at);
      const pct = d.total_questions ? Math.round((d.correct_answers / d.total_questions) * 100) : 0;
      const label = d.status === 'STARTED'
        ? `Drill: ${d.skill}/${d.sub_skill} — abandoned (STARTED, 0 answered)`
        : `Drill: ${d.skill}/${d.sub_skill} — ${pct}% (${d.correct_answers}/${d.total_questions})`;
      byDate.set(key, [...(byDate.get(key) ?? []), label]);
    }
    for (const ia of ias) {
      const key = ymd(ia.ia_date);
      const scores = ia.scores as any[] | null;
      const bandStr = scores && scores.length
        ? scores.map((s) => `${s.sub_skill} ${s.band}`).join(', ')
        : 'no scores (abandoned)';
      byDate.set(key, [...(byDate.get(key) ?? []), `IA #${ia.ia_number} (${ia.status}): ${bandStr}`]);

      // Surface ai_feedback for AI-graded (WRITING/SPEAKING) sub-skills, same as diagnostics.
      for (const s of scores ?? []) {
        if (!s.ai_graded || !s.ai_feedback?.rationale) continue;
        byDate.set(key, [
          ...(byDate.get(key) ?? []),
          `  ↳ ${s.sub_skill} AI feedback: "${s.ai_feedback.rationale}"`,
        ]);
      }
    }

    const dates = [...byDate.keys()].sort();

    push(`## ${persona.name} (${persona.group}${persona.atRisk ? ', AT-RISK' : ''}${persona.isDropout ? ', DROPOUT' : ''}${persona.isErratic ? ', ERRATIC' : ''})`);
    push(`- Momentum: ${student.momentum_score} | Streak: ${student.daily_streak} | Last active: ${student.last_streak_date ? ymd(student.last_streak_date) : '—'}`);
    push('');
    if (!dates.length) {
      push('_No seeded activity found._');
    } else {
      for (const date of dates) {
        push(`**${date}**`);
        for (const line of byDate.get(date)!) push(`- ${line}`);
      }
    }
    push('');
  }

  const md = lines.join('\n');
  console.log(md);

  if (outPath) {
    fs.writeFileSync(outPath, md, 'utf8');
    console.log(`\n[seedSummary] Written to ${outPath}`);
  }
}

main()
  .catch((e) => { console.error('[seedSummary] ERROR:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());

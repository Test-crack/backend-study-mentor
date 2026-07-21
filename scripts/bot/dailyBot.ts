/**
 * Daily student bot — the real-API replacement for dailyTick.
 *
 * For each persona, rolls against their activityRate (shared tickBehavior rules);
 * if active that day, the bot LOGS IN and does 2 drills + a LexiGrid game through
 * the REAL endpoints — so the app produces the data (and any bug surfaces here).
 * Strugglers mostly skip; Kiran (dropout) never acts.
 *
 * IA is gated to scheduled IA days — handled by a separate module (added next),
 * so this loop covers the everyday tasks (drills + LexiGrid).
 *
 * Run once per day (backend must be reachable at API_BASE_URL):
 *   npx ts-node --project tsconfig.dev.json scripts/bot/dailyBot.ts
 *   npx ts-node --project tsconfig.dev.json scripts/bot/dailyBot.ts --email arjun.menon@seed.testcrack.dev
 */
import 'dotenv/config';
import { Command } from 'commander';
import { PERSONAS } from '../seeders/personas';
import { rollActive } from '../seeders/tickBehavior';
import { getToken, api, API_BASE } from './botClient';
import { doDrill, doLexiGrid } from './flows';
import { doIA } from './iaFlow';
import { currentISTDate } from '../../src/lib/timezone';

const program = new Command();
program.option('--email <email>', 'run just one persona');
program.parse(process.argv);
const onlyEmail = program.opts().email as string | undefined;

// Two drills per active day (the count the streak logic needs), rotating skills.
const DRILLS: Array<[string, string]> = [['LISTENING', 'LISTENING'], ['READING', 'READING'], ['WRITING', 'GRAMMAR'], ['SPEAKING', 'FLUENCY']];

async function main() {
  const daySeed = currentISTDate().toISOString().slice(0, 10);
  const roster = onlyEmail ? PERSONAS.filter(p => p.email === onlyEmail) : PERSONAS;

  console.log('═══════════════════════════════════════════════════');
  console.log('  Daily Student Bot (real API)');
  console.log(`  API: ${API_BASE}   IST day: ${daySeed}`);
  console.log('═══════════════════════════════════════════════════\n');

  const DAILY_DRILL_TARGET = 2; // 2 drills/day → unlocks dashboard + advances streak

  let acted = 0, idle = 0, failed = 0;

  for (const persona of roster) {
    let { active: isActive, roll } = rollActive(persona, daySeed);
    const attemptIA = !persona.isDropout; // IA self-gates on the app's eligibility

    // Dropout that's idle on drills = fully idle (that's the dropout signal)
    if (!isActive && !attemptIA) {
      console.log(`  [IDLE] ${persona.name} (dropout)`);
      idle++;
      continue;
    }

    try {
      const token = await getToken(persona);
      const parts: string[] = [];

      // ── On an IA day, drills are MANDATORY ─────────────────────────────────
      // The platform stays LOCKED until 2 drills are done that day, and the IA's own
      // eligibility (today's DCS) needs drill activity — so if an IA is scheduled today
      // and not yet completed, force the drills to run first (regardless of the roll).
      let iaDay = false;
      if (attemptIA) {
        const iaStatus = await api('GET', '/api/ia/status', token);
        iaDay = !!iaStatus.is_ia_day && !iaStatus.has_completed_session;
        if (iaDay && !isActive) isActive = true; // unlock the platform before the IA
      }

      // ── Drills + LexiGrid (active days, or forced on IA day; idempotent guard) ──
      if (isActive) {
        const state = await api('GET', '/api/student/daily-drill-state', token);
        const doneDrills = state.drills_completed_today ?? 0;
        const lexiDone = !!state.lexigrid_completed_today;
        const needed = Math.max(0, DAILY_DRILL_TARGET - doneDrills);

        if (needed === 0 && lexiDone) {
          parts.push('drills already done');
        } else {
          const offset = Math.floor(roll * 4);
          let last: any = null;
          for (let d = 0; d < needed; d++) {
            const [skill, sub] = DRILLS[(offset + d) % 4];
            last = await doDrill(persona, token, skill, sub);
          }
          if (!lexiDone) await doLexiGrid(persona, token);
          parts.push(`${needed} drill(s)${lexiDone ? '' : ' + LexiGrid'}${last ? ` (streak ${last.streak})` : ''}`);
        }
      }

      // ── IA: self-gates — only acts if THIS student's IA is actually due ────
      if (attemptIA) {
        const ia = await doIA(persona, token);
        if (ia.did) parts.push(`IA #${ia.ia_number} ✓`);
      }

      if (parts.length === 0) {
        console.log(`  [IDLE] ${persona.name} (no drills today, no IA due)`);
        idle++;
      } else {
        console.log(`  [ACTIVE]${iaDay ? '[IA-day]' : ''} ${persona.name}: ${parts.join(', ')}`);
        acted++;
      }
    } catch (e: any) {
      console.log(`  [FAIL] ${persona.name}: ${e.message}`);
      failed++;
    }
  }

  console.log(`\n[dailyBot] DONE — ${acted} acted, ${idle} idle, ${failed} failed.`);
}

main().catch((e) => { console.error('❌ ERROR:', e.message); process.exit(1); });

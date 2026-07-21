/**
 * Shared activity rules for the daily simulation. Imported by BOTH dailyTick.ts
 * (the real writer) and simulateDays.ts (the read-only projector) so the preview
 * always matches what the cron will actually do.
 */
import { seededRand } from './utils';
import type { Persona } from './personas';

// Daily chance the student is active. Explicit persona.activityRate wins.
//   Kiran (dropout) = 0; Group C strugglers = 0.6 (trying); erratic = 0.5;
//   HIGH = 0.95; MID = 0.65; active edge = 0.8.
export function activityRate(p: Persona): number {
  if (p.activityRate !== undefined) return p.activityRate;
  if (p.isDropout) return 0.0;
  if (p.atRisk)    return 0.6;
  if (p.isErratic) return 0.5;
  if (p.group === 'HIGH') return 0.95;
  if (p.group === 'MID')  return 0.65;
  return 0.8;
}

// Deterministic per-day activity decision. daySeed = the IST date string "YYYY-MM-DD",
// so a given calendar day always resolves the same way (idempotent + reproducible).
export function rollActive(p: Persona, daySeed: string): { active: boolean; roll: number; rate: number } {
  const rate = activityRate(p);
  const roll = seededRand(`tick-${p.email}-${daySeed}`, 0, 1);
  return { active: roll < rate, roll, rate };
}

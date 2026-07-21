/**
 * Shared IA scheduling + band logic — MUST stay identical to the original
 * scripts/seeders/seedIASessions.ts so the feedback generator and the AI seeder
 * agree on which IAs exist, their sub-skill sets, and their target bands.
 */
import { type Persona } from '../seeders/personas';
import { noisyBand } from '../seeders/utils';

// Same sub-skill sets, in the same order, as seedIASessions.ts.
export const IA_SUBSKILL_SETS = [
  [
    { skill: 'WRITING', sub_skill: 'GRAMMAR' },
    { skill: 'WRITING', sub_skill: 'VOCABULARY' },
    { skill: 'WRITING', sub_skill: 'COHERENCE' },
  ],
  [
    { skill: 'LISTENING', sub_skill: 'LISTENING' },
    { skill: 'READING', sub_skill: 'READING' },
  ],
  [
    { skill: 'SPEAKING', sub_skill: 'FLUENCY' },
    { skill: 'SPEAKING', sub_skill: 'PRONUNCIATION' },
  ],
] as const;

export type IASlot = { iaNumber: number; off: number; index: number };

export function personaMeanBand(persona: Persona): number {
  const b = persona.diagnosticBand;
  return (b.LISTENING + b.READING + b.WRITING + b.SPEAKING) / 4;
}

/** The scheduled IA slots this persona has COMPLETED (oldest → newest, index 0-based). */
export function iaSlots(persona: Persona): IASlot[] {
  const firstDrillOffset = persona.atRisk ? 12 : persona.drillCount - 1;
  const slots: IASlot[] = [];
  for (let k = 1; ; k++) {
    const off = firstDrillOffset - k * 3;
    if (off <= 0) break;
    slots.push({ iaNumber: k, off, index: k - 1 });
  }
  const seeded = persona.isDropout ? slots.slice(0, 1) : slots; // dropout completes only the oldest
  return seeded.map((s, i) => ({ ...s, index: i }));
}

/** The sub-skill set for the IA at this position (cycles every 3). */
export function iaSet(index: number) {
  return IA_SUBSKILL_SETS[index % IA_SUBSKILL_SETS.length];
}

/** 'WRITING' | 'SPEAKING' | null (null = Listening/Reading, MCQ — no AI grading). */
export function iaKind(index: number): 'WRITING' | 'SPEAKING' | null {
  const skill = iaSet(index)[0].skill;
  return skill === 'WRITING' ? 'WRITING' : skill === 'SPEAKING' ? 'SPEAKING' : null;
}

/** Base band for an IA — Group C strugglers' newest IA drops 1.5 (declining); others drift up. */
export function iaBaseBand(persona: Persona, index: number, count: number): number {
  const mean = personaMeanBand(persona);
  const declining = persona.atRisk && !persona.isDropout;
  const isNewest = index === count - 1;
  return declining ? (isNewest && count > 1 ? mean - 1.5 : mean) : mean + index * 0.4;
}

/** Designed (stored) band for a sub-skill — identical seed/jitter to seedIASessions. */
export function subSkillBand(persona: Persona, base: number, subSkill: string, index: number): number {
  return noisyBand(base, `ia-${subSkill}-${persona.email}-${index}`, 0.3);
}

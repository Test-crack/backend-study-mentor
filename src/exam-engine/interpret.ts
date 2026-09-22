// Exam Engine — config INTERPRETER (Stage 0 · config-verification Layer 2 source of truth).
//
// Turns a raw exam config into a structured, plain-English account that a NON-TECHNICAL
// superadmin can read and confirm: what the exam is, its skills / sub-skills, how it is
// SCORED (described, never computed here), how each part is delivered, and what a student
// can target.
//
// This is the exam-AGNOSTIC "describe" layer. It must handle every shape the engine allows
// — aggregate vs per-component (no headline), skills with or without sub-skills, numeric
// bands vs CEFR levels vs scaled sections — WITHOUT special-casing any exam id. It is the
// thing a config is "marked against": if the interpreter can't describe a config in plain
// terms, a human can't confirm it.
//
// DISTINCT from publicConfig.toPublicConfig, which STRIPS scoring internals for the browser.
// The interpreter deliberately DESCRIBES scoring, for an internal (superadmin) surface.

import { ExamConfigEntry, Component, Scale } from './types';

// ── plain-English lookups (fall back to the raw token if unknown, never throw) ──────────
const STRATEGY_PLAIN: Record<string, string> = {
  band_mean: 'the mean of the component scores, rounded to the scale step',
  cefr_hybrid: 'averaging the sub-skill percentages, then mapping to a CEFR level',
};

const DELIVERY_PLAIN: Record<string, string> = {
  audio_item_set: 'audio clips with questions',
  passage_item_set: 'reading passages with questions',
  essay: 'a written essay',
  ielts_speaking: 'a live speaking interview',
  viva: 'a spoken viva',
  roleplay: 'a spoken role-play',
  quantitative_item_set: 'a quantitative question set',
  data_insights_item_set: 'a data-insights question set',
};

// ── structured interpretation ───────────────────────────────────────────────────────────
export interface ScaleInterpretation {
  id: string;
  kind: 'numeric' | 'ordinal' | 'unknown';
  plain: string;              // "0–9 in steps of 0.5, graded A/B/C" / "levels A1 · A2 · …"
  grades?: string[];
}

export interface ScoringInterpretation {
  model: 'aggregate' | 'per_component' | 'unknown';
  headlineExists: boolean;    // is there a single overall score?
  scaleId?: string;
  scalePlain?: string;
  strategy?: string | null;
  strategyPlain?: string;
  fromComponents?: string[];  // labels of components feeding the headline
  plain: string;              // one-sentence description of how results are produced
}

export interface SubSkillInterpretation {
  id: string;
  label: string;
  max?: number;               // raw-points ceiling (OET writing/speaking)
  group?: string;             // display grouping (OET linguistic / clinical)
}

export interface ComponentInterpretation {
  id: string;
  label: string;
  assessed: boolean;          // counts toward results, vs practice-only
  modality?: string;
  delivery?: string;
  deliveryPlain?: string;
  scaleId?: string;
  scalePlain?: string;
  timeLimitMinutes?: number;
  hasSubskills: boolean;
  subskills: SubSkillInterpretation[];
  itemTags?: string[];
  variantScoped?: boolean;
}

export interface InterpretationNote {
  severity: 'info' | 'warn';  // 'warn' = a human should question this before it goes live
  message: string;
}

export interface ExamInterpretation {
  examId: string;
  status: string;             // live | reserved | disabled | …
  name: { public: string; short?: string; legal?: string };
  oneLiner: string;
  scoring: ScoringInterpretation;
  components: ComponentInterpretation[];
  assessedCount: number;
  practiceCount: number;
  scales: ScaleInterpretation[];
  target?: string;            // plain-English target description
  variants?: string;          // plain-English variant description
  modules?: string[];         // enabled module names
  legal?: { rightsHolder?: string; disclaimerShort?: string; posture?: string };
  notes: InterpretationNote[]; // observations a human should notice (NOT structural errors)
}

// ── helpers ─────────────────────────────────────────────────────────────────────────────
function describeScale(id: string, s: Scale | any): ScaleInterpretation {
  if (!s || typeof s !== 'object') return { id, kind: 'unknown', plain: `unknown scale '${id}'` };
  if (s.kind === 'ordinal') {
    const levels: string[] = (s.levels ?? []).map((l: string) => s.labels?.[l] ?? l);
    return { id, kind: 'ordinal', plain: `levels ${levels.join(' · ')}` };
  }
  if (s.kind === 'numeric') {
    let plain = `${s.min}–${s.max} in steps of ${s.step}`;
    const grades: string[] | undefined = Array.isArray(s.grade_bands)
      ? s.grade_bands.map((g: any) => g.grade)
      : undefined;
    if (grades?.length) plain += `, graded ${grades.join('/')}`;
    if (s.computable === false) plain += ' (never computed by us — proprietary)';
    return { id, kind: 'numeric', plain, grades };
  }
  return { id, kind: 'unknown', plain: `scale '${id}' (unrecognised kind)` };
}

function interpretComponent(c: Component | any, scales: Record<string, any>): ComponentInterpretation {
  const subskills: SubSkillInterpretation[] = (c.subskills ?? []).map((s: any) => ({
    id: s.id,
    label: s.label ?? s.id,
    max: typeof s.max === 'number' ? s.max : undefined,
    group: typeof s.group === 'string' ? s.group : undefined,
  }));
  const scaleI = c.scale ? describeScale(c.scale, scales[c.scale]) : undefined;
  return {
    id: c.id,
    label: c.label ?? c.id,
    assessed: !!c.assessed,
    modality: c.modality,
    delivery: c.delivery,
    deliveryPlain: c.delivery ? DELIVERY_PLAIN[c.delivery] ?? c.delivery : undefined,
    scaleId: c.scale,
    scalePlain: scaleI?.plain,
    timeLimitMinutes: typeof c.time_limit_minutes === 'number' ? c.time_limit_minutes : undefined,
    hasSubskills: subskills.length > 0,
    subskills,
    itemTags: Array.isArray(c.item_tags) && c.item_tags.length ? c.item_tags : undefined,
    variantScoped: !!c.variant_scoped,
  };
}

function interpretScoring(
  ex: ExamConfigEntry | any,
  scales: Record<string, any>,
  labelOf: Record<string, string>,
): ScoringInterpretation {
  const o: any = ex.overall ?? {};
  if (o.mode === 'aggregate') {
    const scaleI = o.scale ? describeScale(o.scale, scales[o.scale]) : undefined;
    const strategyPlain = o.strategy ? STRATEGY_PLAIN[o.strategy] ?? `the '${o.strategy}' strategy` : undefined;
    const fromComponents = (o.components ?? []).map((id: string) => labelOf[id] ?? id);
    return {
      model: 'aggregate',
      headlineExists: true,
      scaleId: o.scale,
      scalePlain: scaleI?.plain,
      strategy: o.strategy ?? null,
      strategyPlain,
      fromComponents,
      plain:
        `One overall score, produced by ${strategyPlain ?? 'an unspecified strategy'}` +
        (fromComponents.length ? `, from ${fromComponents.join(', ')}` : '') +
        (scaleI ? `, reported on ${scaleI.plain}.` : '.'),
    };
  }
  if (o.mode === 'per_component') {
    return {
      model: 'per_component',
      headlineExists: false,
      plain: 'No single overall score — each component is reported on its own scale (e.g. a regulator requirement).',
    };
  }
  return {
    model: 'unknown',
    headlineExists: false,
    plain: `Unrecognised scoring mode '${o.mode}'. The engine may not know how to report this exam.`,
  };
}

// ── main entry ──────────────────────────────────────────────────────────────────────────
/**
 * Interpret ONE exam config into a structured, plain-English-ready description.
 * `scales` is the shared scales map (an existing engine's, or a candidate config's own).
 * Pure — no DB, no loader — so it can describe a pasted candidate before it is ever seeded.
 */
export function interpretConfig(ex: ExamConfigEntry | any, scales: Record<string, any> = {}): ExamInterpretation {
  const components: Component[] = Array.isArray(ex.components) ? ex.components : [];
  const labelOf: Record<string, string> = {};
  for (const c of components) labelOf[c.id] = (c as any).label ?? c.id;

  const interpretedComponents = components.map((c) => interpretComponent(c, scales));
  const assessed = interpretedComponents.filter((c) => c.assessed);
  const practice = interpretedComponents.filter((c) => !c.assessed);
  const scoring = interpretScoring(ex, scales, labelOf);

  // Referenced scales only (component scales + the headline scale).
  const scaleIds = new Set<string>();
  for (const c of components) if ((c as any).scale) scaleIds.add((c as any).scale);
  if (ex.overall?.scale) scaleIds.add(ex.overall.scale);
  const scaleInterps = [...scaleIds].map((id) => describeScale(id, scales[id]));

  // Target (plain).
  let target: string | undefined;
  const t: any = ex.target;
  if (t && t.enabled !== false && t.kind) {
    if (t.kind === 'numeric') target = `Students can set an overall target on ${t.scale ?? 'the headline scale'} (${t.min}–${t.max}).`;
    else if (t.kind === 'ordinal') target = `Students can target a level${Array.isArray(t.allowed_levels) ? ` (${t.allowed_levels.join(', ')})` : ''}.`;
    else if (t.kind === 'per_component') target = `Students set a target per component${t.per_component_default ? ` (defaults: ${Object.entries(t.per_component_default).map(([k, v]) => `${labelOf[k] ?? k} ${v}`).join(', ')})` : ''}.`;
  }

  // Variants (plain).
  let variants: string | undefined;
  const v: any = ex.variants;
  if (v && Array.isArray(v.options) && v.options.length) {
    const opts = v.options.map((o: any) => o.label ?? o.id).join(' / ');
    const scoped = Array.isArray(v.applies_to_components) && v.applies_to_components.length
      ? ` (affects ${v.applies_to_components.map((id: string) => labelOf[id] ?? id).join(', ')})`
      : '';
    variants = `Has ${v.dimension ?? 'variant'} options: ${opts}${scoped}.`;
  }

  // Enabled modules.
  const modules = ex.modules && typeof ex.modules === 'object'
    ? Object.keys(ex.modules).filter((k) => {
        const m: any = (ex.modules as any)[k];
        return m === true || (m && typeof m === 'object' && m.enabled !== false);
      })
    : undefined;

  // Notes — observations for a human, NOT structural errors (that's Layer 1 / the validator).
  const notes: InterpretationNote[] = [];
  const note = (severity: 'info' | 'warn', message: string) => notes.push({ severity, message });
  if (ex.status && ex.status !== 'live') note('info', `Status is "${ex.status}" — not yet live to students.`);
  const legalStatus: string | undefined = ex.legal?._status;
  if (legalStatus && /^BLOCKED/i.test(legalStatus)) note('warn', `Legal posture is "${legalStatus}" — BLOCKED; cannot launch until cleared.`);
  else if (legalStatus && /^DRAFT/i.test(legalStatus)) note('info', `Legal posture is "${legalStatus}" — pending sign-off before launch.`);
  if (ex.legal?.may_use_mark_in_product_name === false) note('warn', 'The exam name/trademark may not be usable in the product name — check counsel.');
  if (scoring.model === 'unknown') note('warn', scoring.plain);
  if (scoring.model === 'aggregate') {
    const feeding = new Set<string>(ex.overall?.components ?? []);
    for (const c of assessed) if (!feeding.has(c.id)) note('warn', `"${c.label}" is assessed but does NOT feed the overall score — is that intended?`);
  }
  if (practice.length) note('info', `${practice.length} practice-only component(s): ${practice.map((c) => c.label).join(', ')} (not part of results).`);
  for (const c of assessed) {
    if (c.subskills.some((s) => typeof s.max === 'number')) {
      const total = c.subskills.reduce((n, s) => n + (s.max ?? 0), 0);
      note('info', `"${c.label}" is marked on ${c.subskills.length} criteria totalling ${total} raw points.`);
    }
  }

  const publicName = ex.naming?.public_display_name ?? ex.exam_id;
  const oneLiner =
    `${publicName} — ${assessed.length} assessed component${assessed.length === 1 ? '' : 's'}` +
    (scoring.model === 'aggregate'
      ? `, scored as one overall result${scoring.scalePlain ? ` on ${scoring.scalePlain}` : ''}.`
      : scoring.model === 'per_component'
        ? ', each reported separately (no overall score).'
        : '.');

  return {
    examId: ex.exam_id ?? 'unknown',
    status: ex.status ?? 'unknown',
    name: {
      public: publicName,
      short: ex.naming?.short_code,
      legal: ex.naming?.legal_display_name,
    },
    oneLiner,
    scoring,
    components: interpretedComponents,
    assessedCount: assessed.length,
    practiceCount: practice.length,
    scales: scaleInterps,
    target,
    variants,
    modules: modules && modules.length ? modules : undefined,
    legal: {
      rightsHolder: ex.legal?.rights_holder,
      disclaimerShort: ex.legal?.disclaimer_short,
      posture: legalStatus,
    },
    notes,
  };
}

/** Render an interpretation as plain-English markdown (for the CLI + the "read it back" panel). */
export function describeInterpretation(i: ExamInterpretation): string {
  const L: string[] = [];
  L.push(`# ${i.name.public}${i.name.short ? ` (${i.name.short})` : ''}  —  status: ${i.status}`);
  if (i.name.legal && i.name.legal !== i.name.public) L.push(`_Legal name: ${i.name.legal}_`);
  L.push('');
  L.push(i.oneLiner);
  L.push('');
  L.push(`## How it's scored`);
  L.push(i.scoring.plain);
  L.push('');
  L.push(`## Components (${i.assessedCount} assessed${i.practiceCount ? `, ${i.practiceCount} practice-only` : ''})`);
  for (const c of i.components) {
    const bits = [
      c.assessed ? 'assessed' : 'practice-only',
      c.deliveryPlain,
      c.scalePlain ? `on ${c.scalePlain}` : undefined,
      c.timeLimitMinutes ? `${c.timeLimitMinutes} min` : undefined,
    ].filter(Boolean);
    L.push(`- **${c.label}** — ${bits.join(' · ')}`);
    if (c.hasSubskills) {
      const byGroup: Record<string, SubSkillInterpretation[]> = {};
      for (const s of c.subskills) (byGroup[s.group ?? ''] ??= []).push(s);
      for (const [g, subs] of Object.entries(byGroup)) {
        const list = subs.map((s) => (s.max != null ? `${s.label} (0–${s.max})` : s.label)).join(', ');
        L.push(`    - ${g ? `${g}: ` : ''}${list}`);
      }
    }
  }
  if (i.target) { L.push(''); L.push(`## Target`); L.push(i.target); }
  if (i.variants) { L.push(''); L.push(`## Variants`); L.push(i.variants); }
  if (i.modules?.length) { L.push(''); L.push(`## Modules enabled`); L.push(i.modules.join(', ')); }
  if (i.notes.length) {
    L.push('');
    L.push(`## Worth noticing`);
    for (const n of i.notes) L.push(`- ${n.severity === 'warn' ? '⚠️ ' : ''}${n.message}`);
  }
  return L.join('\n');
}

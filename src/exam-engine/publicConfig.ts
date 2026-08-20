// Exam Engine — config projection for the client (API contract, EE-05 §12).
// The browser NEVER receives the raw config: it contains cut scores
// (thresholds_min_pct), strategy internals, and counsel notes (_-prefixed keys).
// toPublicConfig ships only what the UI needs to render, nothing it needs to score.

import { getEngineConfig } from './loader';

/** Recursively drop internal/sensitive keys: anything `_*` and any cut scores. */
function strip(v: any): any {
  if (Array.isArray(v)) return v.map(strip);
  if (v && typeof v === 'object') {
    const out: any = {};
    for (const [k, val] of Object.entries(v)) {
      if (k.startsWith('_')) continue;              // _status, _note, _threshold_provenance, …
      if (k === 'thresholds_min_pct') continue;     // the CEFR cut scores — scoring, never shipped
      out[k] = strip(val);
    }
    return out;
  }
  return v;
}

/** Legal fields safe to render. Drops internal routing (review_contact, permission_status). */
function publicLegal(legal: any = {}): any {
  return {
    rights_holder: legal.rights_holder ?? null,
    required_attribution: legal.required_attribution ?? null,
    disclaimer_short: legal.disclaimer_short ?? null,
    disclaimer_full: legal.disclaimer_full ?? null,
    banned_terms_near_output: legal.banned_terms_near_output ?? [],
  };
}

export interface PublicExamSummary {
  exam_id: string;
  status: string;
  naming: any;
  legal: any;
}

export interface PublicExamConfig extends PublicExamSummary {
  components: any[];   // remediation stripped (server-side); scoring fields gone
  overall: any;        // mode + components + scale; strategy/params stripped
  scales: Record<string, any>; // SHAPE only (min/max/step, level labels) — no thresholds
  target?: any;
  variants?: any;
  modules?: any;
}

/** Unauthenticated: exam id, naming, legal text, status. For marketing pages. */
export function toPublicExamSummary(examId: string): PublicExamSummary {
  const ex: any = getEngineConfig().exams[examId];
  return {
    exam_id: ex.exam_id ?? examId,
    status: ex.status,
    naming: strip(ex.naming),
    legal: publicLegal(ex.legal),
  };
}

/** Authenticated: everything the app renders from — components, labels, scale shape. */
export function toPublicConfig(examId: string): PublicExamConfig {
  const cfg = getEngineConfig();
  const ex: any = cfg.exams[examId];

  // Referenced scales (shape only — strip() removes thresholds_min_pct + _keys).
  const scaleIds = new Set<string>();
  for (const c of ex.components ?? []) if (c.scale) scaleIds.add(c.scale);
  if (ex.overall?.scale) scaleIds.add(ex.overall.scale);
  const scales: Record<string, any> = {};
  for (const sid of scaleIds) if (cfg.scales[sid]) scales[sid] = strip(cfg.scales[sid]);

  // Components: strip _keys + drop remediation (trigger thresholds are server-side).
  const components = (ex.components ?? []).map((c: any) => {
    const { remediation, ...rest } = strip(c);
    return rest;
  });

  // Overall: keep mode/components/scale; drop strategy name, params + aggregate internals.
  const oAll = strip(ex.overall ?? {});
  const { strategy, params, unofficial_aggregate, ...overall } = oAll;

  return {
    exam_id: ex.exam_id ?? examId,
    status: ex.status,
    naming: strip(ex.naming),
    legal: publicLegal(ex.legal),
    components,
    overall,
    scales,
    ...(ex.target ? { target: strip(ex.target) } : {}),
    ...(ex.variants ? { variants: strip(ex.variants) } : {}),
    ...(ex.modules ? { modules: strip(ex.modules) } : {}),
  };
}

export function listPublicSummaries(): PublicExamSummary[] {
  return Object.keys(getEngineConfig().exams).map(toPublicExamSummary);
}

export function listPublicConfigs(): PublicExamConfig[] {
  return Object.keys(getEngineConfig().exams).map(toPublicConfig);
}

// Exam Engine — config + boundary types (Phase 5).
// Mirrors exam-engine-config.v2.json. Loose where the config is loose; the
// validator (validator.ts) is the real gate, not these types.

export type ScaleKind = 'numeric' | 'ordinal';

export interface NumericScale {
  kind: 'numeric';
  min: number;
  max: number;
  step: number;
  report_floor?: number;
  rounding?: string;
  grade_bands?: { grade: string; min: number; max: number }[];
  computable?: boolean;
  [k: string]: unknown;
}

export interface OrdinalScale {
  kind: 'ordinal';
  levels: string[];
  labels: Record<string, string>;
  thresholds_min_pct: Record<string, number>;
  supports_within_level_progress?: boolean;
  _calibration_status?: string;
  [k: string]: unknown;
}

export type Scale = NumericScale | OrdinalScale;

export interface SubSkill { id: string; label: string; }

export interface RemediationTrigger {
  kind: 'below_pct' | 'below_level' | 'below_score';
  value: number | string;
}

export interface Remediation {
  level: 'component' | 'subskill' | 'item_tag';
  trigger?: RemediationTrigger;
  content_refs?: string[];
  drill_tags?: string[];
  max_items?: number;
}

export interface Component {
  id: string;
  label: string;
  modality?: string;        // reading|listening|writing|speaking|quantitative|integrated — picks the runner, no scoring meaning
  assessed: boolean;        // false = practice surface, outside the headline
  scale?: string;           // references scales.*
  delivery?: string;        // which runner renders it
  weight?: number;
  time_limit_minutes?: number;
  variant_scoped?: boolean;
  subskills?: SubSkill[];
  item_tags?: string[];
  remediation?: Remediation;
  [k: string]: unknown;
}

export type OverallMode = 'aggregate' | 'per_component';

export interface Overall {
  mode: OverallMode;
  strategy?: string | null;   // 'band_mean' | 'cefr_hybrid' | null(per_component)
  components?: string[];      // assessed component ids that feed the headline
  scale?: string;
  [k: string]: unknown;
}

export interface ExamLegal {
  _status?: string;
  disclaimer_short?: string;
  disclaimer_full?: string;
  rights_holder?: string;
  may_use_mark_in_product_name?: boolean;
  banned_terms_near_output?: string[];
  [k: string]: unknown;
}

export interface ExamVariants {
  dimension?: string;
  options: { id: string; label?: string }[];
  applies_to_components: string[];
  default: string;
  [k: string]: unknown;
}

export interface ExamConfigEntry {
  exam_id: string;
  prisma_enum?: string;
  status: 'live' | 'reserved' | 'disabled' | string;
  naming: { public_display_name: string; short_code?: string; [k: string]: unknown };
  legal: ExamLegal;
  components: Component[];
  overall: Overall;
  target?: any;
  variants?: ExamVariants;
  modules?: any;
  [k: string]: unknown;
}

export interface EngineConfig {
  engine_version: string;
  config_version: string;
  defaults?: any;
  scales: Record<string, Scale | any>;   // includes non-scale keys like "_note"
  exams: Record<string, ExamConfigEntry>;
  [k: string]: unknown;
}

// ── Scoring boundary (B4) ──────────────────────────────────────────────────
// Every score entering the engine declares its unit, so a strategy can reject a
// mismatch at the boundary instead of computing a wrong-but-plausible number.
export type RawScore =
  | { unit: 'percent'; value: number }               // 0–100
  | { unit: 'band'; value: number; scale: string }   // scale-native
  | { unit: 'raw'; correct: number; total: number }  // objective MCQ
  | { unit: 'internal'; value: number; min: number; max: number }; // AI internal scale (IELTS 1–10)

export type RawScoreUnit = RawScore['unit'];

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

// Exam Engine — config validator (B2).
// Faithful port of reference-impl.js#validateConfig. Runs on load; errors block
// startup, warnings are logged. The reference JS is the spec — keep this in step
// with it (and with run-vectors.js §0 negative cases).

import { EngineConfig, ValidationResult } from './types';

const KNOWN_STRATEGIES = new Set(['band_mean', 'cefr_hybrid']);
const KNOWN_MODES = new Set(['aggregate', 'per_component']);

export function validateConfig(cfg: EngineConfig): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // ---- scales
  for (const [id, s] of Object.entries(cfg.scales) as [string, any][]) {
    if (id.startsWith('_')) continue;

    if (s.kind === 'ordinal') {
      const vals = Object.values(s.thresholds_min_pct) as number[];
      const asc = vals.every((v, i) => i === 0 || v > vals[i - 1]);
      if (!asc) errors.push(`scale ${id}: thresholds_min_pct must be strictly ascending`);
      if (vals[0] !== 0) errors.push(`scale ${id}: lowest threshold must be 0`);
      if (vals.some((v) => v < 0 || v > 100)) errors.push(`scale ${id}: thresholds must be within 0..100`);
      const declared = new Set<string>(s.levels);
      for (const k of Object.keys(s.thresholds_min_pct)) {
        if (!declared.has(k)) errors.push(`scale ${id}: threshold '${k}' is not a declared level`);
      }
      for (const k of s.levels as string[]) {
        if (!(k in s.labels)) errors.push(`scale ${id}: level '${k}' has no label`);
      }
      if (s._calibration_status === 'PROVISIONAL_UNCALIBRATED') {
        warnings.push(`scale ${id}: thresholds are PROVISIONAL_UNCALIBRATED — results must carry a provisional notice`);
      }
    }

    if (s.kind === 'numeric') {
      if (s.report_floor != null && (s.report_floor < s.min || s.report_floor > s.max)) {
        errors.push(`scale ${id}: report_floor ${s.report_floor} outside [${s.min}, ${s.max}]`);
      }
      if (s.step > 0) {
        const span = (s.max - s.min) / s.step;
        if (Math.abs(span - Math.round(span)) > 1e-9) {
          errors.push(`scale ${id}: step ${s.step} does not divide the scale evenly`);
        }
      }
      if (s.grade_bands) {
        // Bands must tile the scale AT THE SCALE STEP, not at 1.
        const sorted = [...s.grade_bands].sort((a: any, b: any) => a.min - b.min);
        if (sorted[0].min !== s.min) errors.push(`scale ${id}: lowest grade band must start at ${s.min}`);
        if (sorted[sorted.length - 1].max !== s.max) errors.push(`scale ${id}: highest grade band must end at ${s.max}`);
        for (let i = 1; i < sorted.length; i++) {
          const gap = sorted[i].min - sorted[i - 1].max;
          if (Math.abs(gap - s.step) > 1e-9) {
            errors.push(
              `scale ${id}: grade bands ${sorted[i - 1].grade}/${sorted[i].grade} do not tile at step ${s.step} (gap ${gap})`
            );
          }
        }
      }
    }
  }

  // ---- exams
  for (const [id, ex] of Object.entries(cfg.exams) as [string, any][]) {
    const cids = new Set<string>(ex.components.map((c: any) => c.id));
    const assessed = new Set<string>(ex.components.filter((c: any) => c.assessed).map((c: any) => c.id));

    if (!KNOWN_MODES.has(ex.overall.mode)) errors.push(`${id}: unknown overall.mode '${ex.overall.mode}'`);

    if (ex.overall.mode === 'aggregate') {
      if (!KNOWN_STRATEGIES.has(ex.overall.strategy)) {
        errors.push(`${id}: unknown scoring strategy '${ex.overall.strategy}'`);
      }
      if (!ex.overall.components.length) errors.push(`${id}: overall.mode=aggregate but no components listed`);
      for (const c of ex.overall.components) {
        if (!cids.has(c)) errors.push(`${id}: overall.components references unknown component '${c}'`);
        else if (!assessed.has(c)) errors.push(`${id}: overall.components includes '${c}' which is assessed:false`);
      }
    }

    if (ex.overall.mode === 'per_component' && (ex.overall.components?.length)) {
      errors.push(`${id}: overall.mode=per_component must not list components`);
    }

    for (const c of ex.components as any[]) {
      if (c.assessed && !c.scale) errors.push(`${id}.${c.id}: assessed component has no scale`);
      if (c.scale && !(c.scale in cfg.scales)) errors.push(`${id}.${c.id}: unknown scale '${c.scale}'`);
      if (!c.assessed && c.weight !== 0) warnings.push(`${id}.${c.id}: assessed:false but weight ${c.weight}`);

      const r = c.remediation;
      if (r) {
        if (r.level === 'subskill' && !(c.subskills || []).length) {
          errors.push(`${id}.${c.id}: remediation.level='subskill' but the component declares no subskills`);
        }
        if (r.level === 'item_tag' && !(c.item_tags || []).length) {
          errors.push(`${id}.${c.id}: remediation.level='item_tag' but the component declares no item_tags`);
        }
        if (r.trigger?.kind === 'below_level') {
          const sc = cfg.scales[c.scale];
          if (!sc || sc.kind !== 'ordinal') {
            errors.push(`${id}.${c.id}: trigger 'below_level' requires an ordinal scale`);
          } else if (!sc.levels.includes(r.trigger.value)) {
            errors.push(`${id}.${c.id}: trigger level '${r.trigger.value}' not in scale ${c.scale}`);
          }
        }
        if (!(r.content_refs || []).length && !(r.drill_tags || []).length) {
          warnings.push(`${id}.${c.id}: remediation declared but has no content_refs or drill_tags — it will surface nothing`);
        }
      }

      if (c.variant_scoped && !ex.variants) {
        errors.push(`${id}.${c.id}: variant_scoped:true but the exam declares no variants`);
      }
    }

    if (ex.variants) {
      for (const c of ex.variants.applies_to_components) {
        if (!cids.has(c)) errors.push(`${id}: variants.applies_to_components references unknown component '${c}'`);
      }
      const optIds = ex.variants.options.map((o: any) => o.id);
      if (!optIds.includes(ex.variants.default)) {
        errors.push(`${id}: variants.default '${ex.variants.default}' is not one of the declared options`);
      }
    }

    // Legal gate — mechanical, so it cannot be forgotten at launch.
    if (ex.status === 'live') {
      const L = ex.legal;
      if (!L.disclaimer_short || !L.disclaimer_full) errors.push(`${id}: live exam missing disclaimer text`);
      if (L.may_use_mark_in_product_name === false) {
        const mark = (ex.naming.short_code || '').toUpperCase();
        const name = (ex.naming.public_display_name || '').toUpperCase();
        if (mark && name.includes(mark)) {
          warnings.push(
            `${id}: may_use_mark_in_product_name=false but public_display_name contains '${mark}' — counsel must sign this off`
          );
        }
      }
      if ((L._status || '').startsWith('BLOCKED')) errors.push(`${id}: status 'live' but legal is ${L._status}`);
    }

    if (ex.target?.kind === 'per_component' && ex.target.per_component_default) {
      for (const c of Object.keys(ex.target.per_component_default)) {
        if (!cids.has(c)) errors.push(`${id}: target.per_component_default references unknown component '${c}'`);
      }
    }
  }

  return { errors, warnings };
}

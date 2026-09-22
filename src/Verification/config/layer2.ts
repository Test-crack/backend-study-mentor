// Layer 2 — INTERPRETATION. "What does this config MEAN, in plain English, and what should
// a human question?" The interpreter (exam-engine/interpret) is the SINGLE source of truth —
// the same resolution the running platform uses — so the admin's understanding and the app's
// behaviour never diverge. This layer only renders + surfaces its notes as findings.
import { interpretConfig, describeInterpretation } from '../../exam-engine/interpret';
import { ExamConfigEntry } from '../../exam-engine/types';
import { ConfigFinding, Layer2Result, outcomeFrom } from './types';

export function verifyInterpretation(exam: ExamConfigEntry | any, scales: Record<string, any> = {}): Layer2Result {
  const interpretation = interpretConfig(exam, scales);
  const findings: ConfigFinding[] = interpretation.notes.map((n) => ({
    code: n.severity === 'warn' ? 'INTERPRETATION_CONCERN' : 'INTERPRETATION_NOTE',
    severity: n.severity,
    message: n.message,
  }));
  return {
    outcome: outcomeFrom(findings),          // info-only ⇒ pass; a 'warn' note ⇒ warn
    findings,
    interpretation,
    plainEnglish: describeInterpretation(interpretation),
  };
}

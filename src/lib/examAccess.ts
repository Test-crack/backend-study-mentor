// Single source of truth for exam-subscription ACCESS (Track A · A0).
//
// Product rule (agreed 2026-08-23): TRIAL behaves exactly like ACTIVE for access;
// CANCELLED blocks access (CANCELLED == the old "deactivated" behaviour, scoped to
// one exam). Exact billing / trial-expiry / seat-cap logic is deferred — this module
// is ONLY the access gate, so every gate across the app reads the same rule.
//
// Keep enforcement in ONE place: never inline `status === 'ACTIVE'` at call sites
// (that would silently drop TRIAL users). Import `isSubscriptionAccessible` instead.

export type BillingStatus = 'TRIAL' | 'ACTIVE' | 'CANCELLED';

const ACCESSIBLE: ReadonlySet<string> = new Set<BillingStatus>(['TRIAL', 'ACTIVE']);

/** True if a subscription in this billing state grants access. TRIAL == ACTIVE; CANCELLED == no. */
export function isSubscriptionAccessible(status: string | null | undefined): boolean {
  return status != null && ACCESSIBLE.has(status);
}

/** From a list of {exam_id, billing_status}, the exam ids the institute may currently use. */
export function accessibleExamIds(
  subscriptions: ReadonlyArray<{ exam_id: string; billing_status: string | null }>
): string[] {
  return subscriptions.filter((s) => isSubscriptionAccessible(s.billing_status)).map((s) => s.exam_id);
}

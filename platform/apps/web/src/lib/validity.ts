/**
 * How long a passed cert stays current, in months. CNCF moved CKA, CKAD, CKS, KCNA and KCSA to 24 months
 * in 2024. The others are assumed to be 24 months too until each is checked against its Linux Foundation
 * exam page (not reachable from the build sandbox when this was written). Change a value here and every
 * expiry date in the app follows.
 */
export const VALIDITY_MONTHS: Record<string, number> = {
  CKA: 24,
  CKAD: 24,
  CKS: 24,
  KCNA: 24,
  KCSA: 24,
};

export const DEFAULT_VALIDITY_MONTHS = 24;

export function validityMonths(certCode: string): number {
  return VALIDITY_MONTHS[certCode] ?? DEFAULT_VALIDITY_MONTHS;
}

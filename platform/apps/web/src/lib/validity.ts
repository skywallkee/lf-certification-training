/**
 * How long a passed cert stays current, in months, for every cert on the Golden Kubestronaut path.
 *
 * Source: the Linux Foundation Global Certification and Confidentiality Agreement, section 3.2 "Certification
 * Period": certifications "become non-current (expire) 24 months" after the candidate meets the requirements.
 * The agreement lists all 17 certs below by name and gives no cert a different period. CNCF also announced the
 * move of CKA, CKAD, CKS, KCNA and KCSA from 36 to 24 months in 2024.
 *
 * When the Linux Foundation changes a period, change it here: every expiry date and "expiring" badge follows.
 * A unit test fails if a cert in content/curriculum/certs has no entry.
 */
export const VALIDITY_SOURCE = {
  url: "https://docs.linuxfoundation.org/tc-docs/certification/lf-cert-agreement",
  section: "3.2 Certification Period",
  checkedOn: "2026-11-26",
} as const;

export const VALIDITY_MONTHS: Readonly<Record<string, number>> = {
  // Kubestronaut
  KCNA: 24,
  KCSA: 24,
  CKA: 24,
  CKAD: 24,
  CKS: 24,
  // Golden Kubestronaut additions
  LFCS: 24,
  PCA: 24,
  ICA: 24,
  CCA: 24,
  CAPA: 24,
  CGOA: 24,
  CBA: 24,
  OTCA: 24,
  KCA: 24,
  CNPA: 24,
  CNPE: 24,
  CKNE: 24,
};

/** Used only for a cert added to the curriculum before its period is checked (the unit test flags it). */
export const DEFAULT_VALIDITY_MONTHS = 24;

export function validityMonths(certCode: string): number {
  return VALIDITY_MONTHS[certCode.toUpperCase()] ?? DEFAULT_VALIDITY_MONTHS;
}

/**
 * The Golden Kubestronaut path: how the 17 certs are grouped on the path map, the suggested order to take
 * them in, and how the focus cert is chosen after onboarding.
 */

export interface PathGroup {
  key: string;
  name: string;
  certs: string[];
}

export const PATH_GROUPS: PathGroup[] = [
  { key: "kubestronaut", name: "Kubestronaut core", certs: ["KCNA", "KCSA", "CKA", "CKAD", "CKS"] },
  { key: "linux-networking", name: "Linux and networking", certs: ["LFCS", "CKNE"] },
  { key: "platform", name: "Platform engineering", certs: ["CNPA", "CNPE", "CBA"] },
  { key: "delivery", name: "Delivery and GitOps", certs: ["CAPA", "CGOA"] },
  { key: "observability", name: "Observability", certs: ["PCA", "OTCA"] },
  { key: "mesh", name: "Service mesh and networking", certs: ["ICA", "CCA"] },
  { key: "security", name: "Security and policy", certs: ["KCA"] },
];

/**
 * Suggested order: associates before the performance exams they lead into, CKA before CKS and CKNE
 * (CKS needs a current CKA), then the project associates and the platform pair.
 */
export const SUGGESTED_ORDER = [
  "KCNA", "KCSA", "CKA", "CKAD", "CKS", "LFCS", "CKNE",
  "PCA", "OTCA", "CGOA", "CAPA", "ICA", "CCA", "KCA", "CBA", "CNPA", "CNPE",
] as const;

export const KUBESTRONAUT = ["KCNA", "KCSA", "CKA", "CKAD", "CKS"] as const;

/** Prerequisites the exam itself enforces. */
export const PREREQUISITES: Record<string, string> = { CKS: "CKA" };

export type Goal = "golden" | "kubestronaut" | "one";

/** The first cert in the suggested order that the learner does not hold, within their goal. */
export function chooseFocus(goal: Goal | null, goalCert: string | null, held: Set<string>): string | null {
  if (goal === "one") return goalCert;
  const scope: readonly string[] = goal === "kubestronaut" ? KUBESTRONAUT : SUGGESTED_ORDER;
  return scope.find((c) => !held.has(c)) ?? null;
}

export function groupOf(cert: string): PathGroup | undefined {
  return PATH_GROUPS.find((g) => g.certs.includes(cert));
}

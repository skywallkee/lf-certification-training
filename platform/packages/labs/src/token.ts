import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Short-lived terminal tokens. The web app signs one for the signed-in owner of a session; the lab controller
 * verifies it before relaying the terminal. HMAC-SHA256 over a JSON payload, base64url encoded:
 * `<payload>.<signature>`.
 */
export interface TerminalClaims {
  /** Lab session id. */
  sid: string;
  /** User id of the session owner. */
  uid: string;
  /** Expiry, seconds since the epoch. */
  exp: number;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function signTerminalToken(claims: Omit<TerminalClaims, "exp">, secret: string, ttlSeconds = 120, now = Date.now()): string {
  if (secret.length < 32) throw new Error("terminal token secret must be at least 32 characters");
  const payload = Buffer.from(JSON.stringify({ ...claims, exp: Math.floor(now / 1000) + ttlSeconds })).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

/** The claims of a valid, unexpired token, or null. */
export function verifyTerminalToken(token: string, secret: string, now = Date.now()): TerminalClaims | null {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(payload, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as TerminalClaims;
    if (typeof claims.sid !== "string" || typeof claims.uid !== "string" || typeof claims.exp !== "number") return null;
    if (claims.exp * 1000 < now) return null;
    return claims;
  } catch {
    return null;
  }
}

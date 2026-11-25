/**
 * Browser to lab controller terminal protocol, over one WebSocket at `/terminal/<sessionId>?token=...`.
 * Browser to controller: JSON text frames, `{ "type": "input", "data": "ls\r" }` or
 * `{ "type": "resize", "cols": 120, "rows": 32 }`. Controller to browser: binary frames of raw terminal output.
 * The controller speaks ttyd's own protocol to the lab, so the lab's terminal password never reaches the
 * browser. No Node imports here: the browser bundle uses this file.
 */
export type ClientMessage = { type: "input"; data: string } | { type: "resize"; cols: number; rows: number };

/** WebSocket close codes the controller uses, so the player can say what happened. */
export const CLOSE_CODES = {
  /** Token missing, invalid or expired: fetch a new one and reconnect. */
  unauthorized: 4401,
  /** The session is not ready (booting, or already ended). */
  notReady: 4409,
  /** The session ended while the terminal was open. */
  ended: 4410,
  /** The lab's terminal could not be reached. */
  unreachable: 4502,
} as const;

export function parseClientMessage(text: string): ClientMessage | null {
  try {
    const msg = JSON.parse(text) as Partial<ClientMessage> & Record<string, unknown>;
    if (msg.type === "input" && typeof msg.data === "string" && msg.data.length <= 65_536) return { type: "input", data: msg.data };
    if (msg.type === "resize") {
      const cols = Number(msg.cols);
      const rows = Number(msg.rows);
      if (Number.isInteger(cols) && Number.isInteger(rows) && cols > 0 && rows > 0 && cols <= 500 && rows <= 200) {
        return { type: "resize", cols, rows };
      }
    }
    return null;
  } catch {
    return null;
  }
}

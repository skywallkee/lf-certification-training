"use client";

import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef, useState } from "react";
import { CLOSE_CODES } from "@lfct/labs/protocol";
import type { FitAddon } from "@xterm/addon-fit";
import type { Terminal } from "@xterm/xterm";
import { Button } from "@/components/ui/button";

type State = "connecting" | "connected" | "reconnecting" | "ended";

const LABEL: Record<State, string> = {
  connecting: "Connecting",
  connected: "Connected",
  reconnecting: "Reconnecting",
  ended: "Ended",
};

/**
 * xterm.js terminal through the lab controller's relay. Asks the web app for a two-minute token on every
 * (re)connect, reconnects with backoff, never traps focus (F6 leaves the terminal), and keeps screen-reader
 * mode on.
 */
export function TerminalPane({ sessionId, onEnded }: { sessionId: string; onEnded?: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [state, setState] = useState<State>("connecting");
  const [fontSize, setFontSize] = useState(15);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  useEffect(() => {
    let disposed = false;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let observer: ResizeObserver | undefined;

    const send = (msg: object) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    };

    void (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit")]);
      if (disposed || !host.current) return;
      const term = new Terminal({
        fontFamily: '"JetBrains Mono Variable", ui-monospace, monospace',
        fontSize: 15,
        cursorBlink: true,
        screenReaderMode: true,
        scrollback: 5000,
        theme: { background: "#0d1117", foreground: "#d4d4d8", cursor: "#d4d4d8", selectionBackground: "#3b4a63" },
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(host.current);
      fit.fit();
      termRef.current = term;
      fitRef.current = fit;
      // F6 moves focus out of the terminal (handled by the player), so the terminal must not swallow it.
      term.attachCustomKeyEventHandler((e) => e.key !== "F6");
      term.onData((data) => send({ type: "input", data }));
      term.onResize(({ cols, rows }) => send({ type: "resize", cols, rows }));
      observer = new ResizeObserver(() => fit.fit());
      observer.observe(host.current);

      const schedule = () => {
        if (disposed) return;
        setState("reconnecting");
        timer = setTimeout(connect, Math.min(10_000, 500 * 2 ** retry++));
      };
      const connect = async () => {
        if (disposed) return;
        let url: string;
        try {
          const res = await fetch(`/api/labs/sessions/${sessionId}/terminal-token`, { method: "POST" });
          if (res.status === 409 || res.status === 404) {
            setState("ended");
            onEndedRef.current?.();
            return;
          }
          if (!res.ok) throw new Error(String(res.status));
          url = ((await res.json()) as { url: string }).url;
        } catch {
          schedule();
          return;
        }
        const ws = new WebSocket(`${url}&cols=${term.cols}&rows=${term.rows}`);
        ws.binaryType = "arraybuffer";
        wsRef.current = ws;
        ws.onopen = () => {
          retry = 0;
          setState("connected");
        };
        ws.onmessage = (e) => term.write(new Uint8Array(e.data as ArrayBuffer));
        ws.onclose = (e) => {
          if (disposed || wsRef.current !== ws) return;
          if (e.code === CLOSE_CODES.ended || e.code === CLOSE_CODES.notReady) {
            setState("ended");
            onEndedRef.current?.();
            return;
          }
          schedule();
        };
      };
      void connect();
    })();

    return () => {
      disposed = true;
      clearTimeout(timer);
      observer?.disconnect();
      wsRef.current?.close();
      wsRef.current = null;
      termRef.current?.dispose();
      termRef.current = null;
    };
  }, [sessionId]);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.fontSize = fontSize;
    fitRef.current?.fit();
  }, [fontSize]);

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const ws = wsRef.current;
      if (text && ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "input", data: text }));
      termRef.current?.focus();
    } catch {
      // Clipboard permission denied: Ctrl+Shift+V or the browser's paste still work.
    }
  };
  const copy = async () => {
    const text = termRef.current?.getSelection();
    if (text) await navigator.clipboard.writeText(text).catch(() => undefined);
    termRef.current?.focus();
  };

  return (
    <section aria-label="Terminal" data-region="terminal" data-state={state} className="flex min-h-0 flex-1 flex-col rounded-lg border bg-terminal">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-1.5 text-[13px] text-terminal-foreground">
        <span className="flex items-center gap-2" role="status">
          <span
            aria-hidden="true"
            className={`size-2 rounded-full ${state === "connected" ? "bg-green-400" : state === "ended" ? "bg-zinc-500" : "bg-amber-400"}`}
          />
          {LABEL[state]}
          <span className="text-white/60">· candidate@workstation · F6 leaves the terminal</span>
        </span>
        <span className="flex items-center gap-1">
          <Button type="button" size="sm" variant="ghost" className="text-terminal-foreground hover:bg-white/10 hover:text-white" onClick={copy}>
            Copy
          </Button>
          <Button type="button" size="sm" variant="ghost" className="text-terminal-foreground hover:bg-white/10 hover:text-white" onClick={paste}>
            Paste
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-terminal-foreground hover:bg-white/10 hover:text-white"
            onClick={() => setFontSize((s) => Math.max(11, s - 1))}
            aria-label="A− smaller text"
          >
            A−
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-terminal-foreground hover:bg-white/10 hover:text-white"
            onClick={() => setFontSize((s) => Math.min(24, s + 1))}
            aria-label="A+ larger text"
          >
            A+
          </Button>
        </span>
      </div>
      <div ref={host} data-testid="terminal" className="min-h-[360px] flex-1 overflow-hidden p-2" />
    </section>
  );
}

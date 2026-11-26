"use client";

import { useEffect, useState } from "react";
import { formatLeft } from "./session-timer";

/**
 * Shows the player's state in the browser tab ("Preparing", "Ready to start", "12:04 left"), so a learner who
 * switched tabs while clusters boot or an exam runs sees it at a glance. Pass `expiresAt` to count down.
 *
 * It edits the text node of the page's <title> in place, rather than assigning document.title (which swaps the
 * node React keeps for the metadata title), and puts the original text back on unmount unless the next page has
 * already replaced it.
 */
export function TabTitle({ label, expiresAt, skewMs = 0 }: { label: string | null; expiresAt?: string | null; skewMs?: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [expiresAt]);
  const left = expiresAt ? new Date(expiresAt).getTime() - (now + skewMs) : null;
  const text = left !== null ? (left <= 0 ? formatLeft(0) : `${formatLeft(left)} left`) : label;

  useEffect(() => {
    const node = document.querySelector("head title")?.firstChild;
    if (!node || node.nodeType !== Node.TEXT_NODE || !text) return;
    const original = node.nodeValue ?? "";
    const mine = `${text} · ${original}`;
    node.nodeValue = mine;
    return () => {
      if (node.nodeValue === mine) node.nodeValue = original;
    };
  }, [text]);
  return null;
}

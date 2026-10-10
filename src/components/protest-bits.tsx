"use client";
import { useState } from "react";
import { track } from "./client";

/** Share: native share sheet where available, otherwise copies the link. Tracks the share, never who shared. */
export function ShareButton({ title, url, dims, onInk = false }: { title: string; url: string; dims: Record<string, unknown>; onInk?: boolean }) {
  const [msg, setMsg] = useState("");
  return (
    <button type="button" className={`btn btn-ghost ${onInk ? "!border-paper !text-paper hover:!bg-paper hover:!text-ink" : ""}`} onClick={async () => {
      track("PROTEST_SHARED", dims);
      try {
        if (navigator.share) { await navigator.share({ title, url }); return; }
        await navigator.clipboard.writeText(url); setMsg("Link copied");
      } catch { setMsg("Copy the address from your browser"); }
    }}>
      Share{msg && <span className="sr-only"> ({msg})</span>}
      <span aria-live="polite" className="ml-2 text-sm font-normal">{msg}</span>
    </button>
  );
}

/** An outbound link that records a click (page dimensions only). */
export function TrackedLink({ href, event, dims, children, className }: { href: string; event: "OFFICIAL_LINK_CLICKED" | "SUPPORT_ACTION_CLICKED"; dims: Record<string, unknown>; children: React.ReactNode; className?: string }) {
  return <a href={href} className={className} target="_blank" rel="noopener noreferrer" onClick={() => track(event, dims)}>{children}</a>;
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return <button type="button" className="btn btn-sm btn-ghost" onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* ignore */ } }}>{done ? "Copied" : label}</button>;
}

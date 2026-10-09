"use client";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

/** Fire-and-forget analytics. Failures never affect the UI. */
export function track(name: string, props: Record<string, unknown> = {}) {
  try {
    void fetch("/api/track", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, props }), keepalive: true });
  } catch {
    /* ignore */
  }
}

/** Tracks a view once per browser session. */
export function Tracker({ name, props, once = true }: { name: string; props?: Record<string, unknown>; once?: boolean }) {
  useEffect(() => {
    const key = `bmp:${name}:${JSON.stringify(props ?? {})}`;
    try {
      if (once && sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      /* storage unavailable: just track */
    }
    track(name, props);
  }, [name, props, once]);
  return null;
}

export function SubmitButton({ children, pending: label, className = "btn", ...rest }: { children: React.ReactNode; pending?: string; className?: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending} {...rest}>
      {pending ? label ?? "Working…" : children}
    </button>
  );
}

/** Oversized readiness number that counts up (instantly under reduced motion). */
export function Score({ value, className = "" }: { value: number; className?: string }) {
  const [n, setN] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setN(value); return; }
    const start = performance.now();
    const dur = 900;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      setN(Math.round(value * (1 - Math.pow(1 - p, 4))));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value]);
  return (
    <span className={className} role="img" aria-label={`${value} percent ready`}>
      <span aria-hidden="true">{n}<span className="text-[0.45em] align-top">%</span></span>
    </span>
  );
}

export function PrintButton({ className = "btn btn-sm btn-ghost" }: { className?: string }) {
  return <button type="button" className={className} onClick={() => window.print()}>Print / Save as PDF</button>;
}

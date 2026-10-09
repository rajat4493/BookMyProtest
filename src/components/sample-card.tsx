"use client";
import { useState } from "react";
import Link from "next/link";
import { Arrow, Bang, Check } from "./icons";

const ITEMS = [
  { label: "Event details", w: 6, done: true },
  { label: "Organizer information", w: 6, done: true },
  { label: "Sound requirements", w: 5, done: true },
  { label: "Police application", w: 4, done: false },
  { label: "Route map", w: 2, done: false },
  { label: "Medical support", w: 2, done: false },
];

/** Interactive illustration only. Clearly labelled as a sample; not real data. */
export function SampleCard() {
  const [items, setItems] = useState(ITEMS);
  const total = items.reduce((s, i) => s + i.w, 0);
  const pct = Math.round((items.filter((i) => i.done).reduce((s, i) => s + i.w, 0) / total) * 100);
  const left = items.filter((i) => !i.done).length;
  return (
    <div className="card relative bg-paper text-ink shadow-[10px_10px_0_var(--color-ink)]">
      <div className="flex items-center justify-between border-b-2 border-ink px-5 py-3">
        <span className="label">Climate March — Bengaluru</span>
        <span className="chip chip-note">Sample</span>
      </div>
      <div className="px-5 pt-6">
        <div className="flex items-end gap-4">
          <span className="numeral text-[7.5rem] sm:text-[9rem]" aria-live="polite">{pct}<span className="text-[0.4em] align-top">%</span></span>
          <span className="label pb-3">Ready</span>
        </div>
        <div className="mt-4 h-3 w-full border-2 border-ink" role="presentation">
          <div className="h-full bg-accent transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-sm text-mute">{left === 0 ? "Everything on this sample list is done." : `${left} ${left === 1 ? "item" : "items"} left. Tap one to see the score move.`}</p>
      </div>
      <ul className="mt-5 divide-y-2 divide-ink border-t-2 border-ink">
        {items.map((it, idx) => (
          <li key={it.label}>
            <button
              type="button"
              onClick={() => setItems((xs) => xs.map((x, i) => (i === idx ? { ...x, done: !x.done } : x)))}
              aria-pressed={it.done}
              className="flex min-h-14 w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-paper-2"
            >
              <span className={`grid size-7 shrink-0 place-items-center border-2 border-ink ${it.done ? "bg-accent" : "bg-paper"}`}>
                {it.done ? <Check width={16} height={16} /> : <Bang width={16} height={16} />}
              </span>
              <span className="flex-1 font-semibold">{it.label}</span>
              <span className="label text-mute">{it.done ? "Done" : "To do"}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="border-t-2 border-ink p-5">
        <Link href="/plan" className="btn btn-accent w-full">Build my plan <Arrow /></Link>
      </div>
    </div>
  );
}

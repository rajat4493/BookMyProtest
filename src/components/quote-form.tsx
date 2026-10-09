"use client";
import { useState, useTransition } from "react";
import { requestQuoteAction } from "@/app/actions";
import { Arrow } from "./icons";

export function QuoteForm({ eventId, category, categoryLabel, summary, defaults }: {
  eventId: string; category: string; categoryLabel: string; summary: [string, string][]; defaults: { name: string; email: string; phone: string };
}) {
  const [v, setV] = useState({ quantity: "", notes: "", contactName: defaults.name, contactEmail: defaults.email, contactPhone: defaults.phone });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  const err = (k: string) => errors[k] && <p role="alert" className="mt-2 font-semibold">{errors[k]}</p>;
  return (
    <form noValidate className="space-y-5" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await requestQuoteAction(eventId, { category, ...v }); if (r && !r.ok) setErrors(r.errors); }); }}>
      <dl className="panel grid grid-cols-2 divide-hair sm:grid-cols-4 sm:divide-x">
        {summary.map(([k, val]) => (<div key={k} className="p-3"><dt className="label text-mute">{k}</dt><dd className="font-bold">{val}</dd></div>))}
      </dl>
      <div><label htmlFor="q-qty" className="label mb-2 block">Quantity</label><input id="q-qty" className="field" placeholder={`How many / how much ${categoryLabel.toLowerCase()}?`} value={v.quantity} onChange={set("quantity")} maxLength={100} /></div>
      <div><label htmlFor="q-notes" className="label mb-2 block">Notes</label><textarea id="q-notes" className="field" placeholder="Anything the vendor should know: timings, access, power, budget range." value={v.notes} onChange={set("notes")} maxLength={1000} /></div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div><label htmlFor="q-name" className="label mb-2 block">Your name</label><input id="q-name" className="field" autoComplete="name" value={v.contactName} onChange={set("contactName")} aria-invalid={!!errors.contactName} />{err("contactName")}</div>
        <div><label htmlFor="q-email" className="label mb-2 block">Email</label><input id="q-email" type="email" className="field" autoComplete="email" value={v.contactEmail} onChange={set("contactEmail")} aria-invalid={!!errors.contactEmail} />{err("contactEmail")}</div>
      </div>
      <div><label htmlFor="q-phone" className="label mb-2 block">Phone (optional)</label><input id="q-phone" type="tel" className="field" autoComplete="tel" value={v.contactPhone} onChange={set("contactPhone")} /></div>
      {err("form")}{err("category")}
      <button type="submit" className="btn btn-accent w-full sm:w-auto" disabled={pending}>{pending ? "Sending…" : "Request a quote"} {!pending && <Arrow />}</button>
      <p className="text-sm text-mute">We pass these details to matched vendors only. We match by hand for now, so expect a human, not an auto-reply.</p>
    </form>
  );
}

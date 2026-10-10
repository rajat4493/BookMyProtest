"use client";
import { useState, useTransition } from "react";
import { updatePlanDetailsAction } from "@/app/actions";
import type { Answers } from "@/lib/engine/types";

const PROMO: [string, string][] = [["NONE", "None yet"], ["DRAFTING", "Being drafted"], ["PRINTED", "Printed"], ["CIRCULATED", "Already circulated"]];

export function DetailsForm({ eventId, initial, applied }: { eventId: string; initial: Answers; applied: boolean }) {
  const [v, setV] = useState<Record<string, any>>({ speakers: "", promoStatus: "NONE", trafficFootprint: "", ...initial });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV((c) => ({ ...c, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));
  const text = (k: string, label: string, type = "text") => (
    <div><label htmlFor={`d-${k}`} className="label mb-1 block">{label}</label><input id={`d-${k}`} type={type} className="field" value={v[k] ?? ""} onChange={set(k)} aria-invalid={!!errors[k]} aria-describedby={errors[k] ? `d-${k}-e` : undefined} />{errors[k] && <p id={`d-${k}-e`} role="alert" className="mt-1 font-semibold">{errors[k]}</p>}</div>
  );
  const area = (k: string, label: string) => (
    <div><label htmlFor={`d-${k}`} className="label mb-1 block">{label}</label><textarea id={`d-${k}`} className="field" value={v[k] ?? ""} onChange={set(k)} aria-invalid={!!errors[k]} aria-describedby={errors[k] ? `d-${k}-e` : undefined} />{errors[k] && <p id={`d-${k}-e`} role="alert" className="mt-1 font-semibold">{errors[k]}</p>}</div>
  );
  return (
    <form noValidate className="mt-6 space-y-5" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await updatePlanDetailsAction(eventId, v); if (r && !r.ok) setErrors(r.errors); }); }}>
      {applied && <p className="card p-4" role="note" data-testid="reconfirm-note">You have marked your application as submitted. If you materially change the crowd, speakers, purpose, route or nature of the event, you will be advised to re-confirm with the issuing authority.</p>}
      {text("name", "Event name")}
      <div className="grid gap-4 sm:grid-cols-3">{text("date", "Date", "date")}{text("startTime", "Starts", "time")}{text("endTime", "Ends", "time")}</div>
      {text("attendance", "Expected attendance")}
      <div><label htmlFor="d-kind" className="label mb-1 block">Format</label><select id="d-kind" className="field" value={v.kind} onChange={set("kind")}><option value="static">Static gathering</option><option value="march">March</option></select></div>
      {text("startLocation", v.kind === "march" ? "Starting location" : "Location")}
      {v.kind === "march" && text("destination", "Destination")}
      {v.vehicles && text("buses", "Number of buses")}
      {area("description", "Event purpose")}
      {area("speakers", "Speakers / VIPs")}
      {area("trafficFootprint", "Route and traffic footprint")}
      <div><label htmlFor="d-promo" className="label mb-1 block">Promotional material</label><select id="d-promo" className="field" value={v.promoStatus} onChange={set("promoStatus")}>{PROMO.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></div>
      <fieldset className="grid grid-cols-2 gap-3"><legend className="label mb-1">Using</legend>
        {(["stage", "sound", "vehicles", "food"] as const).map((k) => <label key={k} className="flex items-center gap-2"><input type="checkbox" checked={!!v[k]} onChange={set(k)} className="size-5" /> {k === "sound" ? "Loudspeaker / sound" : k[0].toUpperCase() + k.slice(1)}</label>)}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">{text("organizerName", "Organizer name")}{text("organizerEmail", "Organizer email", "email")}{text("organizerPhone", "Organizer phone", "tel")}</div>
      {errors.form && <p role="alert" className="font-semibold">{errors.form}</p>}
      <button className="btn btn-accent" disabled={pending}>{pending ? "Saving…" : "Save and recheck my plan"}</button>
    </form>
  );
}

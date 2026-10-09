"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { createPlanAction, joinWaitlistAction } from "@/app/actions";
import { Arrow, Back, Check } from "./icons";
import { track } from "./client";

export interface CityOption { id: string; label: string; isDevSeed: boolean }

const STEPS = ["Where?", "When?", "What kind of gathering?", "How many people?", "What will you use?", "Who's organising?"] as const;

interface Form {
  cityId: string; venueId: string; name: string; date: string; startTime: string; endTime: string; kind: "static" | "march"; startLocation: string; destination: string;
  description: string; attendance: string; stage: boolean; sound: boolean; vehicles: boolean; food: boolean;
  organizerType: string; organizerName: string; organizerEmail: string; organizerPhone: string;
}

const EMPTY: Form = {
  cityId: "", venueId: "", name: "", date: "", startTime: "10:00", endTime: "13:00", kind: "static", startLocation: "", destination: "", description: "", attendance: "",
  stage: false, sound: false, vehicles: false, food: false, organizerType: "individual", organizerName: "", organizerEmail: "", organizerPhone: "",
};

/** Which step does each server-side error key belong to? */
const FIELD_STEP: Record<string, number> = {
  city: 0, name: 1, date: 1, startTime: 1, endTime: 1, kind: 2, startLocation: 2, destination: 2, description: 2, attendance: 3,
  organizerType: 5, organizerName: 5, organizerEmail: 5, organizerPhone: 5,
};

const STORAGE = "bmp:draft";

function Err({ id, msg }: { id: string; msg?: string }) {
  return msg ? <p id={id} role="alert" className="mt-2 font-semibold text-ink"><span className="chip chip-critical mr-2">Fix</span>{msg}</p> : null;
}

function Label({ htmlFor, children, hint }: { htmlFor: string; children: React.ReactNode; hint?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-2 block">
      <span className="label">{children}</span>
      {hint && <span className="mt-1 block text-sm text-mute">{hint}</span>}
    </label>
  );
}

function Toggle({ id, checked, onChange, title, hint }: { id: string; checked: boolean; onChange: (v: boolean) => void; title: string; hint: string }) {
  return (
    <button type="button" id={id} role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className={`tile flex min-h-20 w-full items-center gap-4 p-4 text-left ${checked ? "bg-accent" : "bg-paper"}`}>
      <span className={`grid size-8 shrink-0 place-items-center border-2 border-ink ${checked ? "bg-ink text-accent" : "bg-paper"}`}>{checked && <Check width={18} height={18} />}</span>
      <span><span className="block text-lg font-extrabold uppercase" style={{ fontStretch: "90%" }}>{title}</span><span className="block text-sm">{hint}</span></span>
      <span className="label ml-auto">{checked ? "Yes" : "No"}</span>
    </button>
  );
}

function Waitlist({ onBack }: { onBack: () => void }) {
  const [v, setV] = useState({ country: "", state: "", city: "", email: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });
  if (done) {
    return (
      <div className="slide-in card bg-accent p-6" role="status">
        <p className="display text-4xl">You&rsquo;re on the list.</p>
        <p className="mt-3">We&rsquo;ll email you when {v.city} goes live.</p>
      </div>
    );
  }
  return (
    <form className="slide-in space-y-5" noValidate onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await joinWaitlistAction(v); if (r.ok) setDone(true); else setErrors(r.errors); }); }}>
      <div className="card bg-ink p-6 text-paper"><p className="display text-4xl text-accent">We&rsquo;re not live here yet.</p><p className="mt-2 text-xl">Join the waitlist.</p></div>
      <div className="grid gap-5 sm:grid-cols-3">
        <div><Label htmlFor="w-country">Country</Label><input id="w-country" className="field" value={v.country} onChange={set("country")} autoComplete="country-name" /></div>
        <div><Label htmlFor="w-state">State / region</Label><input id="w-state" className="field" value={v.state} onChange={set("state")} /></div>
        <div><Label htmlFor="w-city">City</Label><input id="w-city" className="field" value={v.city} onChange={set("city")} aria-describedby="w-city-e" /><Err id="w-city-e" msg={errors.city} /></div>
      </div>
      <div><Label htmlFor="w-email">Email</Label><input id="w-email" type="email" className="field" value={v.email} onChange={set("email")} autoComplete="email" aria-describedby="w-email-e" /><Err id="w-email-e" msg={errors.email} /></div>
      <Err id="w-form" msg={errors.form} />
      <div className="flex gap-3">
        <button type="button" className="btn btn-ghost" onClick={onBack}><Back /> Back</button>
        <button type="submit" className="btn btn-accent flex-1" disabled={pending}>{pending ? "Joining…" : "Join the waitlist"}</button>
      </div>
    </form>
  );
}

export function Wizard({ cities, venues = {}, today }: { cities: CityOption[]; venues?: Record<string, { id: string; label: string }[]>; today: string }) {
  const [step, setStep] = useState(0);
  const [f, setF] = useState<Form>({ ...EMPTY, cityId: cities.length === 1 ? cities[0].id : "" });
  const [elsewhere, setElsewhere] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const started = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);

  // Restore an unfinished draft (browser-only convenience).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE);
      if (raw) { const d = JSON.parse(raw); setF((cur) => ({ ...cur, ...d.f })); setStep(Math.min(d.step ?? 0, STEPS.length - 1)); }
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { try { localStorage.setItem(STORAGE, JSON.stringify({ f, step })); } catch { /* ignore */ } }, [f, step]);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [step, elsewhere]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    if (!started.current) { started.current = true; track("start_plan"); }
    setF((cur) => ({ ...cur, [k]: v }));
    setErrors((e) => { const { [k as string]: _, ...rest } = e; return rest; });
  };

  function validate(s: number): Record<string, string> {
    const e: Record<string, string> = {};
    if (s === 0 && !f.cityId) e.city = "Choose where it's happening";
    if (s === 1) {
      if (f.name.trim().length < 2) e.name = "Give your event a name";
      if (!f.date) e.date = "Choose a date"; else if (f.date < today) e.date = "Pick a date in the future";
      if (f.endTime <= f.startTime) e.endTime = "End time must be after start time";
    }
    if (s === 2) {
      if (f.startLocation.trim().length < 3) e.startLocation = "Where does it start?";
      if (f.kind === "march" && f.destination.trim().length < 3) e.destination = "Where does the march end?";
    }
    if (s === 3 && !(Number(f.attendance) >= 1)) e.attendance = "Roughly how many? Enter a number";
    if (s === 5) {
      if (f.organizerName.trim().length < 2) e.organizerName = "Organizer name is required";
      if (!/^\S+@\S+\.\S+$/.test(f.organizerEmail)) e.organizerEmail = "Enter a valid email";
    }
    return e;
  }

  function next() {
    const e = validate(step);
    setErrors(e);
    if (Object.keys(e).length) return;
    if (step < STEPS.length - 1) { setStep(step + 1); return; }
    start(async () => {
      const { cityId, venueId, ...rest } = f;
      try { localStorage.removeItem(STORAGE); } catch { /* ignore */ }
      const r = await createPlanAction(cityId, rest, venueId || null);
      // On success the action redirects; we only get here with errors.
      if (r && !r.ok) {
        setErrors(r.errors);
        try { localStorage.setItem(STORAGE, JSON.stringify({ f, step })); } catch { /* ignore */ }
        const first = Math.min(...Object.keys(r.errors).map((k) => FIELD_STEP[k] ?? 0));
        setStep(Number.isFinite(first) ? first : 0);
      }
    });
  }

  const preset = (n: number) => (
    <button key={n} type="button" onClick={() => set("attendance", String(n))} aria-pressed={f.attendance === String(n)}
      className={`tile min-h-14 px-4 text-xl font-extrabold ${f.attendance === String(n) ? "bg-accent" : "bg-paper"}`}>{n >= 1000 ? "1,000+" : n}</button>
  );

  if (elsewhere) {
    return <div className="mx-auto w-full max-w-2xl"><Waitlist onBack={() => setElsewhere(false)} /></div>;
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="mb-8" role="group" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
        <div className="flex items-center justify-between label"><span>Step {step + 1} of {STEPS.length}</span><span className="text-mute">Plan a protest</span></div>
        <div className="mt-3 flex gap-1.5" aria-hidden="true">
          {STEPS.map((_, i) => <span key={i} className={`h-2 flex-1 border-2 border-ink transition-colors duration-500 ${i <= step ? "bg-ink" : "bg-transparent"}`} />)}
        </div>
      </div>

      <form key={step} className="slide-in" noValidate onSubmit={(e) => { e.preventDefault(); next(); }}>
        <h1 ref={heading} tabIndex={-1} className="display text-[clamp(3rem,13vw,6.5rem)] outline-none">{STEPS[step]}</h1>

        <div className="mt-8 space-y-6">
          {step === 0 && (
            <>
              <div>
                <Label htmlFor="city" hint="Pick from cities we cover today.">City</Label>
                <select id="city" className="field" value={f.cityId} onChange={(e) => {
                  if (e.target.value === "__else") { setElsewhere(true); return; }
                  set("cityId", e.target.value);
                  set("venueId", "");
                }} aria-describedby="city-e" aria-invalid={!!errors.city}>
                  <option value="">Choose a city</option>
                  {cities.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  <option value="__else">My city isn&rsquo;t listed</option>
                </select>
                <Err id="city-e" msg={errors.city} />
              </div>
              {(venues[f.cityId] ?? []).length > 0 && (
                <div className="slide-in">
                  <Label htmlFor="venue" hint="Some places have venue-specific rules. Pick yours if it's listed.">Venue</Label>
                  <select id="venue" className="field" value={f.venueId} onChange={(e) => set("venueId", e.target.value)}>
                    <option value="">Another location / not decided</option>
                    {venues[f.cityId].map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                  </select>
                </div>
              )}
              <p className="text-mute">Rules are local, so we only show requirements for places we&rsquo;ve configured. Nowhere else yet.</p>
            </>
          )}

          {step === 1 && (
            <>
              <div><Label htmlFor="name" hint="A working title is fine.">Event name</Label><input id="name" className="field" value={f.name} maxLength={120} onChange={(e) => set("name", e.target.value)} aria-describedby="name-e" aria-invalid={!!errors.name} /><Err id="name-e" msg={errors.name} /></div>
              <div><Label htmlFor="date">Date</Label><input id="date" type="date" min={today} className="field" value={f.date} onChange={(e) => set("date", e.target.value)} aria-describedby="date-e" aria-invalid={!!errors.date} /><Err id="date-e" msg={errors.date} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label htmlFor="start">Starts</Label><input id="start" type="time" className="field" value={f.startTime} onChange={(e) => set("startTime", e.target.value)} /></div>
                <div><Label htmlFor="end">Ends</Label><input id="end" type="time" className="field" value={f.endTime} onChange={(e) => set("endTime", e.target.value)} aria-describedby="end-e" aria-invalid={!!errors.endTime} /><Err id="end-e" msg={errors.endTime} /></div>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <fieldset>
                <legend className="label mb-2">Format</legend>
                <div className="grid grid-cols-2 gap-3">
                  {([["static", "Static gathering", "Stays in one place"], ["march", "March", "Moves along a route"]] as const).map(([k, t, d]) => (
                    <button key={k} type="button" aria-pressed={f.kind === k} onClick={() => set("kind", k)} className={`tile min-h-28 p-4 text-left ${f.kind === k ? "bg-accent" : "bg-paper"}`}>
                      <span className="block text-xl font-extrabold uppercase" style={{ fontStretch: "90%" }}>{t}</span><span className="text-sm">{d}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
              <div><Label htmlFor="startLoc" hint="Name the place as people would find it.">{f.kind === "march" ? "Starting location" : "Location"}</Label><input id="startLoc" className="field" value={f.startLocation} maxLength={300} onChange={(e) => set("startLocation", e.target.value)} autoComplete="street-address" aria-describedby="startLoc-e" aria-invalid={!!errors.startLocation} /><Err id="startLoc-e" msg={errors.startLocation} /></div>
              {f.kind === "march" && <div className="slide-in"><Label htmlFor="dest">Destination</Label><input id="dest" className="field" value={f.destination} maxLength={300} onChange={(e) => set("destination", e.target.value)} aria-describedby="dest-e" aria-invalid={!!errors.destination} /><Err id="dest-e" msg={errors.destination} /></div>}
              <div><Label htmlFor="desc" hint="Optional. One or two plain sentences. It becomes your event description.">What is it about?</Label><textarea id="desc" className="field" value={f.description} maxLength={1000} onChange={(e) => set("description", e.target.value)} /></div>
            </>
          )}

          {step === 3 && (
            <>
              <div><Label htmlFor="att" hint="A rough number is fine. Thresholds in local rules depend on it.">Expected attendance</Label><input id="att" inputMode="numeric" pattern="[0-9]*" className="field text-3xl font-black" value={f.attendance} onChange={(e) => set("attendance", e.target.value.replace(/\D/g, "").slice(0, 7))} aria-describedby="att-e" aria-invalid={!!errors.attendance} /><Err id="att-e" msg={errors.attendance} /></div>
              <div className="grid grid-cols-3 gap-3">{[25, 100, 250, 500, 1000].map(preset)}</div>
            </>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <Toggle id="stage" checked={f.stage} onChange={(v) => set("stage", v)} title="Stage" hint="A raised platform or structure" />
              <Toggle id="sound" checked={f.sound} onChange={(v) => set("sound", v)} title="Loudspeaker / sound" hint="Amplified speech or music" />
              <Toggle id="vehicles" checked={f.vehicles} onChange={(v) => set("vehicles", v)} title="Vehicles" hint="Buses, trucks or cars involved" />
              <Toggle id="food" checked={f.food} onChange={(v) => set("food", v)} title="Food or water" hint="You plan to hand it out" />
            </div>
          )}

          {step === 5 && (
            <>
              <div>
                <Label htmlFor="otype">Organizing as</Label>
                <select id="otype" className="field" value={f.organizerType} onChange={(e) => set("organizerType", e.target.value)}>
                  <option value="individual">Individual</option><option value="group">Group / collective</option><option value="student">Student body</option>
                  <option value="ngo">Non-profit / NGO</option><option value="union">Union / association</option><option value="other">Other</option>
                </select>
              </div>
              <div><Label htmlFor="oname">Organizer name</Label><input id="oname" className="field" value={f.organizerName} autoComplete="name" onChange={(e) => set("organizerName", e.target.value)} aria-describedby="oname-e" aria-invalid={!!errors.organizerName} /><Err id="oname-e" msg={errors.organizerName} /></div>
              <div><Label htmlFor="oemail">Email</Label><input id="oemail" type="email" className="field" value={f.organizerEmail} autoComplete="email" onChange={(e) => set("organizerEmail", e.target.value)} aria-describedby="oemail-e" aria-invalid={!!errors.organizerEmail} /><Err id="oemail-e" msg={errors.organizerEmail} /></div>
              <div><Label htmlFor="ophone" hint="Optional. Goes only on your own documents.">Phone</Label><input id="ophone" type="tel" className="field" value={f.organizerPhone} autoComplete="tel" onChange={(e) => set("organizerPhone", e.target.value)} /></div>
              <Err id="form-e" msg={errors.form} />
            </>
          )}
        </div>

        <div className="mt-10 flex gap-3">
          {step > 0 && <button type="button" className="btn btn-ghost" onClick={() => setStep(step - 1)}><Back /> Back</button>}
          <button type="submit" className="btn btn-accent flex-1" disabled={pending}>
            {pending ? "Building your plan…" : step === STEPS.length - 1 ? "Show my readiness" : "Next"} {!pending && <Arrow />}
          </button>
        </div>
      </form>
    </div>
  );
}

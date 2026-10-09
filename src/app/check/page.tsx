import Link from "next/link";
import { Footer, Header, TrustNote } from "@/components/chrome";
import { EvidenceLine } from "@/components/requirement";
import { EmptyState } from "@/components/empty";
import { Arrow } from "@/components/icons";
import { evaluate } from "@/lib/engine/evaluate";
import { LEVEL_LABEL, SEVERITY_LABEL } from "@/lib/plan";
import { applicableFor } from "@/lib/knowledge";
import { jurisdictionChain, listSupportedCities } from "@/lib/store";
import type { Answers } from "@/lib/engine/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Check requirements" };

type SP = { city?: string; attendance?: string; kind?: string; stage?: string; sound?: string; vehicles?: string; food?: string };

export default async function Check({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const cities = await listSupportedCities();
  const city = cities.find((c) => c.id === sp.city);
  const answers: Answers = {
    name: "", date: "", startTime: "", endTime: "", attendance: Math.max(1, Number(sp.attendance) || 100), kind: sp.kind === "march" ? "march" : "static",
    startLocation: "", destination: "", description: "", stage: !!sp.stage, sound: !!sp.sound, vehicles: !!sp.vehicles, food: !!sp.food,
    organizerType: "individual", organizerName: "", organizerEmail: "", organizerPhone: "",
  };
  // Document/identity items that depend on a saved plan are left out of this quick check.
  const today = new Date().toISOString().slice(0, 10);
  const applicable = city ? await applicableFor(await jurisdictionChain(city.id), today, answers) : null;
  const items = applicable ? evaluate(applicable.rules, answers, new Set(), applicable.overlays).filter((i) => i.rule.category === "permissions" && (i.level === "REQUIRED" || i.level === "LIKELY_REQUIRED" || i.level === "RECOMMENDED")) : [];
  const checks = [["stage", "Stage"], ["sound", "Loudspeaker / sound"], ["vehicles", "Vehicles"], ["food", "Food or water"]] as const;

  return (
    <>
      <Header />
      <main id="main" className="mx-auto max-w-3xl px-4 pb-10 pt-6 sm:px-8">
        <h1 className="display text-[clamp(2.5rem,9.8vw,5.3rem)]">Check requirements.</h1>
        <p className="mt-3 text-lg text-mute">A quick look at the permissions your plan may trigger. No account needed.</p>
        <form method="get" className="mt-8 space-y-5">
          <div><label htmlFor="c-city" className="label mb-2 block">City</label>
            <select id="c-city" name="city" className="field" defaultValue={sp.city ?? ""} required><option value="">Choose a city</option>{cities.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
            <p className="mt-2 text-sm text-mute">Not listed? <Link className="underline" href="/plan">Join the waitlist</Link>.</p></div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div><label htmlFor="c-att" className="label mb-2 block">Expected attendance</label><input id="c-att" name="attendance" inputMode="numeric" className="field" defaultValue={sp.attendance ?? "100"} /></div>
            <div><label htmlFor="c-kind" className="label mb-2 block">Format</label><select id="c-kind" name="kind" className="field" defaultValue={sp.kind ?? "static"}><option value="static">Static gathering</option><option value="march">March</option></select></div>
          </div>
          <fieldset><legend className="label mb-2">Will you use</legend>
            <div className="grid gap-3 sm:grid-cols-2">{checks.map(([k, l]) => (<label key={k} className="tile-quiet flex min-h-14 cursor-pointer items-center gap-3 bg-paper px-4"><input type="checkbox" name={k} defaultChecked={!!sp[k]} className="size-5 accent-ink" /><span className="font-bold">{l}</span></label>))}</div></fieldset>
          <button className="btn btn-accent">Check requirements <Arrow /></button>
        </form>

        {sp.city && !city && <p className="mt-8 bg-ink p-5 text-paper" role="status"><span className="heading text-2xl text-accent">We&rsquo;re not live here yet.</span><br />Join the waitlist from <Link className="underline" href="/plan">the planner</Link>.</p>}
        {city && (
          <section className="mt-12" aria-labelledby="res-h">
            <h2 id="res-h" className="heading text-2xl sm:text-3xl">Permissions for {city.label}</h2>
            <p className="mt-2 text-mute">Based on currently configured local requirements.</p>
            {items.length === 0 && <div className="mt-6"><EmptyState glyph="permissions" title="No permissions configured for this combination">That doesn't mean none apply. Please verify with the relevant authority.</EmptyState></div>}
            <ul className="mt-6 space-y-3">
              {items.map((i) => (
                <li key={i.rule.id} className="panel p-4 sm:p-5">
                  <h3 className="heading text-lg">{i.rule.title}</h3>
                  <p className="label mt-1 text-mute">{SEVERITY_LABEL[i.rule.severity]} · {LEVEL_LABEL[i.level]}</p>
                  <p className="mt-2">{i.rule.description}</p>
                  <div className="mt-2"><EvidenceLine item={i} /></div>
                </li>
              ))}
            </ul>
            <Link href="/plan" className="btn mt-8">Turn this into a plan <Arrow /></Link>
          </section>
        )}
        <div className="mt-12"><TrustNote /></div>
      </main>
      <Footer />
    </>
  );
}

import Link from "next/link";
import { Footer, Header, TrustNote } from "@/components/chrome";
import { Tracker } from "@/components/client";
import { Arrow, Glyph } from "@/components/icons";
import { SampleCard } from "@/components/sample-card";
import { listVendorCategories } from "@/lib/store";

export const dynamic = "force-dynamic";

const FLOW = [
  ["Idea", "You know what you want to say."],
  ["Requirements", "We list what your plan triggers."],
  ["Permissions", "See what to ask, and who to ask."],
  ["Logistics", "Sound, water, stages, stewards."],
  ["Ready", "A score, a checklist, a pack."],
];

const BEHIND = [
  ["permissions", "Permissions", "What your city asks for, based on what you're planning.", "md:col-span-2 md:row-span-2"],
  ["documents", "Documents", "Letters, undertakings, checklists. Drafted for you.", ""],
  ["route", "Route", "Start, destination, timings. One sheet.", ""],
  ["sound", "Sound", "Loudspeakers have rules. Know them early.", ""],
  ["transport", "Transport", "Buses, parking, drop-offs.", ""],
  ["water", "Water", "Enough for the crowd and the hours.", ""],
  ["medical", "Medical", "First aid and a nearby hospital, sorted.", ""],
  ["vendors", "Vendors", "Request quotes for the physical bits.", "md:col-span-2"],
] as const;

export default async function Home() {
  const categories = await listVendorCategories();
  return (
    <>
      <Tracker name="landing_page_view" />
      <div className="on-ink bg-ink text-paper"><Header invert /></div>
      <main id="main">
      <div className="on-ink bg-ink text-paper">
        <section className="mx-auto max-w-7xl px-4 pb-16 pt-10 sm:px-8 md:pb-28 md:pt-20">
          <p className="label rise text-accent" style={{ "--i": 0 } as React.CSSProperties}>Organise. Prepare. Show up.</p>
          <h1 className="display rise mt-6 text-[clamp(3.6rem,15.5vw,13.5rem)]" style={{ "--i": 1 } as React.CSSProperties}>
            If you&rsquo;re going to show up,<br />
            show up <span className="bg-accent px-[0.08em] text-ink">prepared.</span>
          </h1>
          <div className="mt-10 grid gap-8 md:grid-cols-[1.1fr_1fr] md:items-end">
            <p className="rise max-w-xl text-xl text-paper/85 sm:text-2xl" style={{ "--i": 3 } as React.CSSProperties}>
              Plan the paperwork, permissions and logistics behind your public gathering — in one place.
            </p>
            <div className="rise flex flex-col gap-3 sm:flex-row" style={{ "--i": 4 } as React.CSSProperties}>
              <Link href="/plan" className="btn btn-accent">Plan a protest <Arrow /></Link>
              <Link href="/check" className="btn btn-ghost !border-paper !text-paper hover:!bg-paper hover:!text-ink">Check requirements</Link>
              <a href="#how" className="btn btn-ghost !border-paper !text-paper hover:!bg-paper hover:!text-ink">See how it works</a>
            </div>
          </div>
          <p className="label mt-14 text-paper/60">Permissions • Logistics • Vendors • Readiness</p>
        </section>
        <div className="border-t-2 border-paper/20" aria-hidden="true">
          <div className="mx-auto flex max-w-7xl flex-wrap gap-x-8 gap-y-1 px-4 py-3 label text-paper/50 sm:px-8">
            {["Permissions", "Routes", "Sound", "Water", "Vendors", "Deadlines"].map((w) => <span key={w}>{w}</span>)}
          </div>
        </div>
      </div>

        <section id="how" className="mx-auto max-w-7xl px-4 py-20 sm:px-8 md:py-32">
          <h2 className="display text-[clamp(2.8rem,10vw,8.5rem)]">
            Protests are complicated.<br /><span className="text-mute">Planning them shouldn&rsquo;t be.</span>
          </h2>
          <ol className="mt-14 grid gap-0 border-2 border-ink md:grid-cols-5">
            {FLOW.map(([t, d], i) => (
              <li key={t} className="rise relative border-b-2 border-ink p-6 last:border-b-0 md:border-b-0 md:border-r-2 md:last:border-r-0" style={{ "--i": i } as React.CSSProperties}>
                <span className="numeral text-6xl text-mute" aria-hidden="true">0{i + 1}</span>
                <h3 className={`display mt-6 text-3xl ${i === 4 ? "marker" : ""}`}>{t}</h3>
                <p className="mt-3 text-mute">{d}</p>
                {i < 4 && <Arrow className="absolute -bottom-3 right-4 bg-paper md:-right-3 md:bottom-auto md:top-1/2 md:right-[-13px] md:-translate-y-1/2 md:rotate-0 rotate-90" />}
              </li>
            ))}
          </ol>
        </section>

        <section className="on-ink bg-ink py-20 text-paper md:py-32">
          <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-8 lg:grid-cols-[1fr_minmax(0,32rem)] lg:items-center">
            <div>
              <h2 className="display text-[clamp(2.8rem,9vw,7.5rem)]">A protest is an <span className="text-accent">event.</span><br />Treat it like one.</h2>
              <p className="mt-8 max-w-lg text-xl text-paper/80">Permissions. Routes. Sound. Water. Vendors. Deadlines.<br />Know what needs doing before the day arrives.</p>
            </div>
            <SampleCard />
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-8 md:py-32">
          <h2 className="display text-[clamp(2.8rem,9vw,7.5rem)]">Everything behind<br />the protest.</h2>
          <div className="mt-12 grid auto-rows-[minmax(11rem,auto)] gap-4 sm:grid-cols-2 md:grid-cols-4">
            {BEHIND.map(([g, t, d, span], i) => (
              <Link key={t} href="/plan" className={`tile rise group flex flex-col justify-between p-5 ${span} ${i === 0 ? "bg-accent" : "bg-paper"}`} style={{ "--i": i } as React.CSSProperties}>
                <Glyph name={g} width={32} height={32} />
                <div>
                  <h3 className={`display ${i === 0 ? "text-6xl md:text-7xl" : "text-3xl"}`}>{t}</h3>
                  <p className="mt-2 max-w-xs text-sm">{d}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="border-y-2 border-ink bg-paper-2 py-20 md:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-8">
            <h2 className="display text-[clamp(2.8rem,9vw,7.5rem)]">Need something?<br /><span className="marker">Find someone who provides it.</span></h2>
            <ul className="mt-12 flex flex-wrap gap-3">
              {categories.map((c) => (
                <li key={c.slug}>
                  <Link href="/plan" className="tile inline-flex min-h-12 items-center bg-paper px-4 font-bold uppercase" style={{ fontStretch: "90%" }}>{c.label}</Link>
                </li>
              ))}
            </ul>
            <p className="mt-8 max-w-xl text-lg text-mute">Tell us what you need once your plan is set. Request a quote and we&rsquo;ll match you by hand.</p>
          </div>
        </section>

        <section className="mx-auto grid max-w-7xl gap-10 px-4 py-20 sm:px-8 md:grid-cols-[1.2fr_1fr] md:py-28">
          <div>
            <p className="label text-mute">Trust</p>
            <p className="display-wide mt-4 text-3xl sm:text-5xl">BookMyProtest helps organizers understand and prepare for public-assembly requirements.</p>
            <p className="display-wide mt-6 text-3xl text-mute sm:text-5xl">Final permissions and approvals are issued solely by the relevant authorities.</p>
          </div>
          <dl className="space-y-6 self-end border-t-2 border-ink pt-6">
            {[
              ["Sourced, or flagged.", "Every requirement shows its source and when it was last verified. If it has neither, we say it needs verification."],
              ["Unknown stays unknown.", "Where we can't tell, we say so and point you to the authority."],
              ["Neutral on every cause.", "We help with logistics, not opinions. Any lawful assembly, any cause."],
            ].map(([t, d]) => (
              <div key={t}><dt className="display-wide text-xl">{t}</dt><dd className="mt-1 text-mute">{d}</dd></div>
            ))}
          </dl>
        </section>

        <section className="bg-accent">
          <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-20 sm:px-8 md:flex-row md:items-end md:justify-between md:py-28">
            <h2 className="display text-[clamp(3rem,11vw,9.5rem)]">Have something to say?<br />Start planning.</h2>
            <Link href="/plan" className="btn shrink-0">Plan a protest <Arrow /></Link>
          </div>
        </section>
        <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-8"><TrustNote /></div>
      </main>
      <Footer />
    </>
  );
}

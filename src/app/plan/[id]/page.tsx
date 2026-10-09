import Link from "next/link";
import { Footer, TrustNote, Wordmark } from "@/components/chrome";
import { Score, Tracker } from "@/components/client";
import { Arrow, Glyph } from "@/components/icons";
import { RequirementRow } from "@/components/requirement";
import { getUser } from "@/lib/auth";
import { headline } from "@/lib/engine/readiness";
import { addDays, isActionable } from "@/lib/engine/evaluate";
import { PLANNING_BUFFER_DAYS, daysUntil, formatDate, loadPlan, LEVEL_LABEL } from "@/lib/plan";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your readiness" };

const CAT_LABEL = { permissions: "Permissions", documents: "Documents", logistics: "Logistics", safety: "Safety" } as const;

export default async function Dashboard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { event, city, cityLabel, items, readiness: r } = await loadPlan(id);
  const user = await getUser();
  const a = event.answers;
  const h = headline(r);
  const open = items.filter((i) => isActionable(i) && !i.done);
  const done = items.filter((i) => isActionable(i) && i.done);
  const notes = items.filter((i) => !isActionable(i));
  const next = r.blockers[0] ?? r.required[0] ?? r.recommended[0];
  const target = addDays(event.date, -PLANNING_BUFFER_DAYS);
  const toEvent = daysUntil(event.date);
  const toTarget = daysUntil(target);
  const critDeadlines = open.filter((i) => i.deadline && i.rule.severity !== "RECOMMENDED").sort((x, y) => x.deadline!.localeCompare(y.deadline!));
  const returning = Date.now() - Date.parse(event.createdAt) > 60 * 60 * 1000;

  const groups = [
    { key: "CRITICAL", title: "Critical", sub: "These block everything else.", items: open.filter((i) => i.rule.severity === "CRITICAL") },
    { key: "REQUIRED", title: "Required", sub: "Expected for your plan.", items: open.filter((i) => i.rule.severity === "REQUIRED") },
    { key: "RECOMMENDED", title: "Recommended", sub: "Not mandatory, but you'll want them.", items: open.filter((i) => i.rule.severity === "RECOMMENDED") },
  ];

  return (
    <>
      <Tracker name="view_requirements" props={{ eventId: event.id }} />
      {returning && <Tracker name="return_visit" props={{ eventId: event.id }} />}
      <main id="main">
      <div className="on-ink bg-ink text-paper">
        <header className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-8"><Wordmark invert /><Link href={user ? "/account" : "/"} className="label hover:underline">{user ? "My plans" : "Home"}</Link></header>
        <div className="mx-auto max-w-7xl px-4 pb-12 pt-6 sm:px-8 md:pb-16">
          <p className="label text-paper/60">Your assembly plan</p>
          <h1 className="display-wide mt-2 text-3xl sm:text-5xl">{event.name}</h1>
          <p className="mt-2 text-paper/75">{formatDate(event.date)} · {a.startTime}–{a.endTime} · {a.startLocation}, {cityLabel}</p>
          <div className="mt-8 grid items-end gap-6 md:grid-cols-[auto_1fr] md:gap-14">
            <Score value={r.pct} className="numeral rise text-[clamp(9rem,38vw,20rem)] text-accent" />
            <div className="rise pb-2 md:pb-6" style={{ "--i": 2 } as React.CSSProperties}>
              <p className="display text-[clamp(2.2rem,7vw,4.8rem)]">{h.title}</p>
              <p className="mt-3 text-xl text-paper/85">{h.sub}</p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Link href={`/plan/${event.id}/pack`} className="btn btn-accent">Generate my preparation pack <Arrow /></Link>
                <Link href={`/plan/${event.id}/vendors`} className="btn btn-ghost !border-paper !text-paper hover:!bg-paper hover:!text-ink">Get quotes</Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl space-y-14 px-4 py-10 sm:px-8">
        {city?.isDevSeed && (
          <p className="card bg-paper-2 p-4 text-sm" role="note"><span className="chip chip-note mr-2">Development sample</span>These requirements are placeholder data for testing and have not been verified. Do not rely on them.</p>
        )}
        {!user && (
          <aside className="card flex flex-col gap-4 bg-accent p-5 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="display-wide text-2xl">Save your plan.</p><p>Create a free account to keep it safe and come back from any device.</p></div>
            <Link href={`/signup?next=/plan/${event.id}`} className="btn shrink-0">Save with an account</Link>
          </aside>
        )}

        {next && (
          <section aria-labelledby="next-h">
            <h2 id="next-h" className="label">Next action</h2>
            <a href={`#r-${next.rule.id}`} className="tile mt-3 flex items-center justify-between gap-4 bg-paper p-5">
              <span><span className="display-wide block text-2xl sm:text-3xl">{next.rule.title}</span><span className="text-mute">{next.rule.description}</span></span>
              <Arrow className="shrink-0" />
            </a>
          </section>
        )}

        <section aria-labelledby="cats-h">
          <h2 id="cats-h" className="sr-only">Progress by category</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {r.categories.map((c, i) => (
              <div key={c.category} className="card rise p-4 sm:p-5" style={{ "--i": i } as React.CSSProperties}>
                <div className="flex items-center justify-between"><span className="label">{CAT_LABEL[c.category]}</span><Glyph name={c.category} width={22} height={22} /></div>
                <p className="numeral mt-5 text-6xl sm:text-7xl">{c.done}<span className="text-mute">/{c.total}</span></p>
                <p className="label mt-2 text-mute">{c.total === 0 ? "Nothing configured" : `${c.done} of ${c.total} complete`}</p>
                <div className="mt-3 h-2 border-2 border-ink" aria-hidden="true"><div className="bar-grow h-full bg-ink" style={{ width: `${c.pct ?? 0}%` }} /></div>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="time-h">
          <h2 id="time-h" className="display text-4xl sm:text-5xl">Timeline</h2>
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <div className="card p-5">
              <p className="label text-mute">Application target date</p>
              <p className="display-wide mt-2 text-2xl">{formatDate(target)}</p>
              <p className="mt-2 text-sm text-mute">{toTarget >= 0 ? `${toTarget} days from today.` : "This date has passed. Contact the authority as soon as you can."} Our suggested planning buffer of {PLANNING_BUFFER_DAYS} days, not a legal deadline.</p>
            </div>
            <div className="card bg-ink p-5 text-paper">
              <p className="label text-paper/60">Event date</p>
              <p className="display-wide mt-2 text-2xl">{formatDate(event.date)}</p>
              <p className="mt-2 text-sm text-paper/70">{toEvent > 0 ? `${toEvent} days to go.` : toEvent === 0 ? "That's today." : "This date has passed."}</p>
            </div>
            <div className="card p-5">
              <p className="label text-mute">Critical deadlines</p>
              {critDeadlines.length === 0 ? <p className="mt-2 text-sm text-mute">No configured deadlines for your open items. Ask the authority about notice periods.</p> : (
                <ul className="mt-2 space-y-2">{critDeadlines.slice(0, 4).map((i) => <li key={i.rule.id} className="text-sm"><span className="font-bold">{formatDate(i.deadline!)}</span> — {i.rule.title}</li>)}</ul>
              )}
            </div>
          </div>
        </section>

        <section aria-labelledby="req-h" className="space-y-12">
          <div>
            <h2 id="req-h" className="display text-4xl sm:text-5xl">What needs doing</h2>
            <p className="mt-2 text-mute">Based on currently configured local requirements for {cityLabel}.</p>
          </div>
          {groups.filter((g) => g.items.length).map((g) => (
            <div key={g.key}>
              <div className="mb-4 flex flex-wrap items-baseline gap-3 border-b-2 border-ink pb-2"><h3 className="display text-3xl">{g.title}</h3><span className="label text-mute">{g.items.length} · {g.sub}</span></div>
              <ul className="space-y-3">{g.items.map((i) => <RequirementRow key={i.rule.id} item={i} eventId={event.id} />)}</ul>
            </div>
          ))}
          {open.length === 0 && <p className="card bg-accent p-5 text-xl font-bold">Everything on your list is done. Verify details with the authority before the day.</p>}
          {done.length > 0 && (
            <details>
              <summary className="display cursor-pointer text-3xl">Done <span className="text-mute">({done.length})</span></summary>
              <ul className="mt-4 space-y-3">{done.map((i) => <RequirementRow key={i.rule.id} item={i} eventId={event.id} />)}</ul>
            </details>
          )}
          {notes.length > 0 && (
            <details>
              <summary className="display cursor-pointer text-3xl">Other notes <span className="text-mute">({notes.length})</span></summary>
              <ul className="mt-4 space-y-3">
                {notes.map((i) => (
                  <li key={i.rule.id} className="card p-4"><p className="display-wide text-lg">{i.rule.title} <span className="label ml-2 text-mute">{LEVEL_LABEL[i.level]}</span></p><p className="mt-1 text-sm text-mute">{i.rule.description}</p><p className="mt-1 text-sm">Please verify with the relevant authority.</p></li>
                ))}
              </ul>
            </details>
          )}
        </section>

        <TrustNote />
      </div>
      </main>
      <Footer />
    </>
  );
}

import Link from "next/link";
import { generatePackAction } from "@/app/actions";
import { Footer, Header } from "@/components/chrome";
import { PrintButton, SubmitButton } from "@/components/client";
import { Arrow, Back } from "@/components/icons";
import { DOC_KINDS, buildAll, type BuiltDoc } from "@/lib/documents";
import { chainFor, selectTemplateMap } from "@/lib/knowledge";
import { formatDate, loadPlan } from "@/lib/plan";

export const dynamic = "force-dynamic";
export const metadata = { title: "Preparation pack" };

function Sheet({ d, n, total, eventName, generatedOn }: { d: BuiltDoc; n: number; total: number; eventName: string; generatedOn: string }) {
  return (
    <article id={d.slug} className="print-doc mx-auto w-full max-w-[48rem] scroll-mt-6 border border-hair bg-white px-6 py-8 sm:px-14 sm:py-14">
      <header className="flex items-baseline justify-between gap-4 border-b border-ink pb-3">
        <p className="label">Draft · not an official document</p>
        <p className="label text-mute">{String(n).padStart(2, "0")} / {String(total).padStart(2, "0")}</p>
      </header>
      <h2 className="heading mt-8 text-2xl sm:text-3xl">{d.title}</h2>
      <p className="label mt-2 text-mute">{eventName} · generated {generatedOn}</p>
      <div className="mt-8 space-y-8 leading-relaxed">
        {d.blocks.map((b, i) => (
          <section key={i}>
            {b.heading && <h3 className="label mb-3 border-b border-hair pb-1 text-mute">{b.heading}</h3>}
            {b.rows && (
              <dl className="divide-y divide-hair border-y border-hair">
                {b.rows.map(([k, v]) => (<div key={k} className="grid gap-x-6 py-2 sm:grid-cols-[11rem_1fr]"><dt className="text-mute">{k}</dt><dd className="font-medium">{v}</dd></div>))}
              </dl>
            )}
            {b.paragraphs?.map((p, j) => <p key={j} className="mt-3 whitespace-pre-line first:mt-0">{p}</p>)}
            {b.bullets && <ul className="space-y-1.5">{b.bullets.map((x, j) => <li key={j} className={`whitespace-pre-line ${x.startsWith("[") ? "font-mono text-[0.9rem]" : "list-inside list-disc"}`}>{x}</li>)}</ul>}
          </section>
        ))}
      </div>
      <footer className="mt-12 border-t border-ink pt-3">
        <p className="text-sm font-semibold">{d.disclaimer}</p>
        <p className="label mt-1 text-mute">BookMyProtest · {d.title}{d.templateVersion > 0 ? ` · template v${d.templateVersion}` : ""}</p>
      </footer>
    </article>
  );
}

export default async function Pack({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ready?: string }> }) {
  const { id } = await params;
  const { ready } = await searchParams;
  const plan = await loadPlan(id);
  const generatedOn = new Date().toISOString().slice(0, 10);
  const templates = ready ? await selectTemplateMap(await chainFor(plan.event), plan.event.date) : undefined;
  const docs = ready ? buildAll({ answers: plan.event.answers, cityLabel: plan.cityLabel, items: plan.items, readiness: plan.readiness, generatedOn, templates }) : [];
  return (
    <>
      <div className="no-print"><Header /></div>
      <main id="main" className="mx-auto max-w-5xl px-4 pb-10 pt-6 sm:px-8">
        <Link href={`/plan/${plan.event.id}`} className="no-print label inline-flex items-center gap-2 underline-offset-4 hover:underline"><Back width={16} height={16} /> Back to {plan.event.name}</Link>
        <h1 className="display no-print mt-6 text-[clamp(2.3rem,9vw,5.6rem)]">{ready ? "Your preparation pack." : "Generate your pack."}</h1>
        <p className="no-print mt-3 max-w-xl text-lg text-mute">
          {ready ? "Six drafts built from your answers. Review, adapt, and sign anything yourself." : "Six printable drafts built from your answers. Nothing here is submitted anywhere."}
        </p>

        <ol className="no-print mt-10 divide-y divide-hair border-y border-hair" aria-label="Contents">
          {DOC_KINDS.map((d, i) => (
            <li key={d.slug}>
              {ready ? (
                <a href={`#${d.slug}`} className="flex items-baseline gap-4 py-3 hover:bg-paper-2"><span className="label w-8 text-mute">{String(i + 1).padStart(2, "0")}</span><span className="heading text-lg">{d.title}</span><span className="hidden text-mute sm:inline">{d.blurb}</span></a>
              ) : (
                <div className="flex items-baseline gap-4 py-3"><span className="label w-8 text-mute">{String(i + 1).padStart(2, "0")}</span><span className="heading text-lg">{d.title}</span><span className="hidden text-mute sm:inline">{d.blurb}</span></div>
              )}
            </li>
          ))}
        </ol>

        {!ready ? (
          <form action={generatePackAction} className="no-print mt-8"><input type="hidden" name="eventId" value={plan.event.id} /><SubmitButton className="btn btn-accent" pending="Generating…">Generate my preparation pack <Arrow /></SubmitButton></form>
        ) : (
          <>
            <div className="no-print mt-8 flex flex-wrap gap-3">
              <PrintButton className="btn" />
              <a className="btn btn-ghost" href={`/plan/${plan.event.id}/pack/download`} download>Download all (.txt)</a>
            </div>
            <p className="no-print mt-4 text-sm text-mute">Draft generated by BookMyProtest. Verify requirements with the relevant authority before submission. Event date: {formatDate(plan.event.date)}.</p>
            <div className="mt-8 space-y-8 bg-paper-2 p-3 sm:p-10 print:bg-white print:p-0">
              {docs.map((d, i) => <Sheet key={d.slug} d={d} n={i + 1} total={docs.length} eventName={plan.event.name} generatedOn={generatedOn} />)}
            </div>
          </>
        )}
      </main>
      <div className="no-print"><Footer /></div>
    </>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { checkSourceAction, recordContentAction, saveSourceAction } from "@/app/actions";
import { Field, Flash } from "@/components/admin-ui";
import { SOURCE_TYPES } from "@/lib/engine/types";
import { getSource, listSnapshots, listSources } from "@/lib/knowledge";
import { listJurisdictions } from "@/lib/store";
import { query } from "@/lib/db";

export default async function SourcePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string; result?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const src = id === "new" ? null : await getSource(id);
  if (id !== "new" && !src) notFound();
  const js = await listJurisdictions();
  const allSources = await listSources();
  const snaps: any[] = src ? await listSnapshots(src.id) : [];
  const rules: any[] = src ? await query(`SELECT r.id, r.title, r.rule_family_id, r.version, r.rule_status FROM rules r JOIN rule_sources rs ON rs.rule_id=r.id WHERE rs.source_id=$1 ORDER BY r.rule_family_id, r.version`, [src.id]) : [];
  const sel = (name: string, opts: readonly string[], v?: string) => <select name={name} defaultValue={v} className="field !min-h-11">{opts.map((o) => <option key={o}>{o}</option>)}</select>;
  return (
    <>
      <h1 className="heading text-3xl">{src ? src.title : "New source"}</h1>
      <Flash sp={sp} />
      <form action={saveSourceAction} className="mt-6 grid max-w-3xl gap-4">
        <input type="hidden" name="id" defaultValue={src?.id ?? ""} />
        <Field label="Title"><input name="title" required defaultValue={src?.title} className="field !min-h-11" /></Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Source code"><input name="sourceCode" defaultValue={src?.sourceCode ?? ""} className="field !min-h-11" placeholder="DEL-SO-LNO-10-2022" /></Field>
          <Field label="Order number"><input name="orderNumber" defaultValue={src?.orderNumber} className="field !min-h-11" placeholder="L&O/10/2022" /></Field>
          <Field label="Official index URL"><input name="indexUrl" type="url" defaultValue={src?.indexUrl ?? ""} className="field !min-h-11" /></Field>
        </div>
        <Field label="Document URL (leave empty until the actual PDF is recovered; never guess)"><input name="documentUrl" type="url" defaultValue={src?.documentUrl ?? ""} className="field !min-h-11" /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <label>Source type{sel("sourceType", SOURCE_TYPES, src?.sourceType ?? "OFFICIAL_ADMINISTRATIVE_RULE")}</label>
          <Field label="Issuing authority"><input name="issuingAuthority" defaultValue={src?.issuingAuthority} className="field !min-h-11" /></Field>
          <label>Jurisdiction<select name="jurisdictionId" defaultValue={src?.jurisdictionId ?? ""} className="field !min-h-11"><option value="">—</option>{js.map((j) => <option key={j.id} value={j.id}>{j.name} ({j.level})</option>)}</select></label>
          <Field label="Canonical URL"><input name="canonicalUrl" type="url" defaultValue={src?.canonicalUrl ?? ""} className="field !min-h-11" /></Field>
          <Field label="Publication date"><input name="publicationDate" type="date" defaultValue={src?.publicationDate ?? ""} className="field !min-h-11" /></Field>
          <Field label="Effective date"><input name="effectiveDate" type="date" defaultValue={src?.effectiveDate ?? ""} className="field !min-h-11" /></Field>
          <Field label="Retrieved"><input name="retrievedAt" type="date" defaultValue={src?.retrievedAt ?? ""} className="field !min-h-11" /></Field>
          <label>Lifecycle{sel("lifecycle", ["CURRENT", "HISTORICAL", "PLACEHOLDER"], src?.lifecycle ?? "CURRENT")}</label>
          <label>Superseded by<select name="supersededBySourceId" defaultValue={src?.supersededBySourceId ?? ""} className="field !min-h-11"><option value="">—</option>{allSources.filter((x) => x.id !== src?.id).map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</select></label>
          <label>Monitoring frequency{sel("monitoringFrequency", ["DAILY", "WEEKLY", "MONTHLY", "MANUAL"], src?.monitoringFrequency ?? "WEEKLY")}</label>
        </div>
        <label className="flex items-center gap-2"><input type="checkbox" name="monitoringEnabled" defaultChecked={src?.monitoringEnabled} /> Monitor this source for changes (needs a URL)</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={src?.active ?? true} /> Active</label>
        <Field label="Notes"><textarea name="notes" defaultValue={src?.notes} className="field" /></Field>
        <button className="btn w-fit">Save source</button>
      </form>

      {src && (
        <>
          <section className="mt-10 max-w-3xl">
            <h2 className="heading text-xl">Regulatory Watch</h2>
            <p className="text-sm text-mute">Last checked: {src.lastCheckedAt ?? "never"} · hash {src.contentHash ? src.contentHash.slice(0, 12) : "—"}. A changed hash creates a change event, puts rules that cite this source into <b>CHANGE_DETECTED</b>, and adds it to the review queue. Nothing is published automatically.</p>
            <div className="mt-3 flex flex-wrap gap-3">
              {src.canonicalUrl && <form action={checkSourceAction}><input type="hidden" name="id" value={src.id} /><button className="btn btn-sm">Check now</button></form>}
            </div>
            <form action={recordContentAction} className="mt-4 grid gap-2">
              <input type="hidden" name="id" value={src.id} />
              <label>Record content manually (paste the source text as it reads now)<textarea name="content" className="field !min-h-28" /></label>
              <button className="btn btn-sm btn-ghost w-fit">Record snapshot</button>
            </form>
          </section>
          <section className="mt-8 max-w-3xl">
            <h2 className="heading text-xl">Snapshots</h2>
            {snaps.length === 0 ? <p className="mt-2 text-mute">No snapshots yet. The first one becomes the baseline.</p> : (
              <ul className="mt-2 divide-y divide-hair border-y border-hair text-sm">{snaps.map((s) => <li key={s.id} className="flex justify-between gap-3 py-2"><span>{new Date(s.retrieved_at).toISOString().slice(0, 16).replace("T", " ")} · {s.status}</span><span className="font-mono text-xs">{String(s.content_hash).slice(0, 12)} · {s.chars} chars</span></li>)}</ul>
            )}
          </section>
          <section className="mt-8 max-w-3xl">
            <h2 className="heading text-xl">Cited by</h2>
            {rules.length === 0 ? <p className="mt-2 text-mute">No rule cites this source yet.</p> : <ul className="mt-2 text-sm">{rules.map((r) => <li key={r.id}><Link className="underline" href={`/admin/rules/${r.id}`}>{r.title}</Link> · {r.rule_family_id} v{r.version} · {r.rule_status}</li>)}</ul>}
          </section>
        </>
      )}
    </>
  );
}

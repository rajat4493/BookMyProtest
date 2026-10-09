import Link from "next/link";
import { notFound } from "next/navigation";
import { linkSourceAction, ruleLifecycleAction, saveRuleDraftAction, unlinkSourceAction } from "@/app/actions";
import { Field, Flash, StatusChip } from "@/components/admin-ui";
import { evidenceStatus } from "@/lib/engine/evaluate";
import { ASSEMBLY_TYPES, CATEGORIES, CONDITION_FIELDS, CONFIDENCES, EVIDENCE_STRENGTHS, INHERITANCE_MODES, LEVELS, OPS, SEVERITIES, type Clause, type Condition } from "@/lib/engine/types";
import { listAuthorities, listSources } from "@/lib/knowledge";
import { getRule, listJurisdictions, listVendorCategories, ruleVersions } from "@/lib/store";
import { query } from "@/lib/db";

const ROWS = 5;

function ClauseRows({ prefix, clauses, label }: { prefix: string; clauses: Clause[]; label: string }) {
  return (
    <fieldset className="mt-2"><legend className="font-semibold">{label}</legend>
      {Array.from({ length: ROWS }, (_, i) => {
        const c = clauses[i];
        const val = c?.value === undefined ? "" : Array.isArray(c.value) ? c.value.join(",") : String(c.value);
        return (
          <div key={i} className="mt-1 grid grid-cols-[1fr_6rem_1fr] gap-2">
            <select name={`${prefix}_field_${i}`} defaultValue={c?.field ?? ""} className="field !min-h-10" aria-label={`${label} field ${i + 1}`}><option value="">—</option>{CONDITION_FIELDS.map((f) => <option key={f}>{f}</option>)}</select>
            <select name={`${prefix}_op_${i}`} defaultValue={c?.op ?? "eq"} className="field !min-h-10" aria-label={`${label} operator ${i + 1}`}>{OPS.map((o) => <option key={o}>{o}</option>)}</select>
            <input name={`${prefix}_value_${i}`} defaultValue={val} className="field !min-h-10" placeholder="true / 500 / a,b" aria-label={`${label} value ${i + 1}`} />
          </div>
        );
      })}
    </fieldset>
  );
}
const CondEditor = ({ prefix, cond, title }: { prefix: string; cond: Condition | null; title: string }) => (
  <div className="panel mt-4 p-4"><h3 className="heading text-lg">{title}</h3>
    <ClauseRows prefix={`${prefix}_all`} clauses={cond?.all ?? []} label="ALL of these must be true" />
    <ClauseRows prefix={`${prefix}_any`} clauses={cond?.any ?? []} label="AND at least ONE of these (leave empty to skip)" />
  </div>
);

export default async function EditRule({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string; jurisdiction?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const rule = id === "new" ? null : await getRule(id);
  if (id !== "new" && !rule) notFound();
  const [js, auths, vcs, sources, versions] = await Promise.all([listJurisdictions(), listAuthorities(), listVendorCategories(), listSources(), rule ? ruleVersions(rule.ruleFamilyId) : Promise.resolve([])]);
  const docRows = rule ? await query("SELECT name, required, conditional, template_key, notes FROM rule_documents WHERE rule_id=$1 ORDER BY name", [rule.id]) : [];
  const editable = !rule || rule.status === "DRAFT" || rule.status === "UNDER_REVIEW";
  const sel = (name: string, opts: readonly string[], v?: string | null, blank = false) => (
    <select name={name} defaultValue={v ?? ""} className="field !min-h-11">{blank && <option value="">—</option>}{opts.map((o) => <option key={o}>{o}</option>)}</select>
  );
  const d = rule?.deadline;
  return (
    <>
      <div className="flex flex-wrap items-center gap-3"><h1 className="heading text-3xl">{rule ? rule.title : "New rule"}</h1>{rule && <StatusChip status={rule.status} />}</div>
      {rule && <p className="mt-1 font-mono text-sm text-mute">{rule.ruleFamilyId} · v{rule.version} · {evidenceStatus(rule) === "verified" ? "Evidence verified" : "Needs verification"}</p>}
      <Flash sp={sp} />

      {rule && (
        <section className="panel mt-6 p-4" aria-label="Lifecycle">
          <h2 className="heading text-lg">Lifecycle</h2>
          <p className="mt-1 text-sm text-mute">Live rules are never edited in place. Clone as a new version, change and evidence the draft, then publish: the old version is superseded on the new version&rsquo;s effective date.</p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            {rule.status === "DRAFT" && <form action={ruleLifecycleAction}><input type="hidden" name="id" value={rule.id} /><input type="hidden" name="op" value="submit" /><button className="btn btn-sm btn-ghost">Submit for review</button></form>}
            {editable && <form action={ruleLifecycleAction} className="flex items-end gap-2"><input type="hidden" name="id" value={rule.id} /><input type="hidden" name="op" value="publish" /><label className="text-sm">Reason<input name="reason" className="field !min-h-10" placeholder="Why publish?" /></label><button className="btn btn-sm">Publish</button></form>}
            {!editable && rule.status !== "ARCHIVED" && <form action={ruleLifecycleAction}><input type="hidden" name="id" value={rule.id} /><input type="hidden" name="op" value="clone" /><button className="btn btn-sm">Clone as new version</button></form>}
            {rule.status !== "ARCHIVED" && <form action={ruleLifecycleAction}><input type="hidden" name="id" value={rule.id} /><input type="hidden" name="op" value="archive" /><button className="btn btn-sm btn-ghost">Archive</button></form>}
          </div>
          <h3 className="label mt-4 text-mute">Version history</h3>
          <ul className="mt-1 text-sm">{versions.map((v) => <li key={v.id}><Link className={`underline ${v.id === rule.id ? "font-bold" : ""}`} href={`/admin/rules/${v.id}`}>v{v.version}</Link> · {v.status} · {v.effectiveFrom ?? "—"} → {v.effectiveUntil ?? "open"}</li>)}</ul>
        </section>
      )}

      <form action={saveRuleDraftAction} className="mt-6 grid max-w-3xl gap-4">
        <input type="hidden" name="id" defaultValue={rule?.id ?? ""} />
        <fieldset disabled={!editable} className="grid gap-4">
          {!rule && <Field label="Rule family code (e.g. DEL-JM-001; leave blank to generate)"><input name="ruleFamilyId" className="field !min-h-11" /></Field>}
          <Field label="Title (requirement name)"><input name="title" required defaultValue={rule?.title} className="field" /></Field>
          <Field label="Legal statement (the legal fact, quoting the source)"><textarea name="legalStatement" defaultValue={rule?.legalStatement} className="field" /></Field>
          <Field label="Plain-English explanation"><textarea name="description" defaultValue={rule?.description} className="field" /></Field>
          <Field label="User action (what the product tells them to do)"><input name="userAction" defaultValue={rule?.userAction} className="field !min-h-11" /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <label>Jurisdiction<select name="jurisdictionId" defaultValue={rule?.jurisdictionId ?? sp.jurisdiction} className="field !min-h-11">{js.map((j) => <option key={j.id} value={j.id}>{j.name} ({j.level})</option>)}</select></label>
            <label>Authority<select name="authorityId" defaultValue={auths.find((a) => a.name === rule?.authorityName)?.id ?? ""} className="field !min-h-11"><option value="">—</option>{auths.filter((a) => a.active).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
            <label>Assembly type{sel("assemblyType", ASSEMBLY_TYPES, rule?.assemblyType)}</label>
            <label>Category{sel("category", CATEGORIES, rule?.category)}</label>
            <label>Rule type<input name="requirementType" defaultValue={rule?.requirementType ?? "general"} className="field !min-h-11" /></label>
            <label>Requirement status when conditions match{sel("level", LEVELS, rule?.level)}</label>
            <label>Status when they do not match{sel("elseLevel", LEVELS, rule?.elseLevel, true)}</label>
            <label>Severity{sel("severity", SEVERITIES, rule?.severity)}</label>
            <label>Inheritance{sel("inheritanceMode", INHERITANCE_MODES, rule?.inheritanceMode)}</label>
            <label>Overrides rule family (for OVERRIDE / EXCLUDE)<input name="overridesFamilyId" defaultValue={rule?.overridesFamilyId ?? ""} className="field !min-h-11" /></label>
            <label>Effective from<input type="date" name="effectiveFrom" defaultValue={rule?.effectiveFrom ?? ""} className="field !min-h-11" /></label>
            <label>Effective until (exclusive)<input type="date" name="effectiveUntil" defaultValue={rule?.effectiveUntil ?? ""} className="field !min-h-11" /></label>
            <label>Vendor category (adds “Get quotes”){sel("vendorCategory", vcs.map((v) => v.slug), rule?.vendorCategory, true)}</label>
            <label>Sort order<input name="sort" type="number" defaultValue={rule?.sort ?? 100} className="field !min-h-11" /></label>
          </div>

          <div className="panel p-4"><h2 className="heading text-lg">Deadline</h2>
            <p className="text-sm text-mute">Never enter a number without a source. Choose “No published deadline found” or “Unknown” instead.</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <label>Kind{sel("deadlineKind", ["UNKNOWN", "NO_PUBLISHED_DEADLINE_FOUND", "STRUCTURED"], d?.kind ?? "UNKNOWN")}</label>
              <label>Day type{sel("deadlineDayType", ["CALENDAR", "BUSINESS"], d?.dayType ?? "CALENDAR")}</label>
              <label>Minimum days before event<input name="deadlineMin" type="number" min={0} defaultValue={d?.minimumDaysBeforeEvent ?? ""} className="field !min-h-11" /></label>
              <label>Maximum days before event<input name="deadlineMax" type="number" min={0} defaultValue={d?.maximumDaysBeforeEvent ?? ""} className="field !min-h-11" /></label>
              <label>Cutoff time<input name="deadlineCutoff" type="time" defaultValue={d?.cutoffTime ?? ""} className="field !min-h-11" /></label>
              <label>Special notes<input name="deadlineNotes" defaultValue={d?.specialNotes ?? ""} className="field !min-h-11" /></label>
            </div>
          </div>
          <Field label="Submission method"><input name="submissionMethod" defaultValue={rule?.submissionMethod} className="field !min-h-11" placeholder="e.g. in person, online portal, email" /></Field>
          <Field label="Official link"><input name="officialLink" type="url" defaultValue={rule?.officialLink ?? ""} className="field !min-h-11" /></Field>
          <Field label="Required documents (one per line: Name | REQUIRED or CONDITIONAL | template key | notes)"><textarea name="documents" className="field !min-h-24" defaultValue={docRows.map((x: any) => `${x.name} | ${x.conditional ? "CONDITIONAL" : "REQUIRED"} | ${x.template_key ?? ""} | ${x.notes}`).join("\n")} /></Field>
          <CondEditor prefix="cond" cond={rule?.condition ?? null} title="Applies when (conditional logic)" />
          <CondEditor prefix="done" cond={rule?.completeWhen ?? null} title="Counts as complete automatically when (optional)" />
          <p className="text-sm text-mute">Fields: attendance, march, sound, vehicles, stage, food, organizerType, description, … Operators: eq, neq, gt, gte, lt, lte, in (comma list), present.</p>
          <div className="panel p-4"><h2 className="heading text-lg">Verification</h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <label>Last verified<input name="lastVerifiedAt" type="date" defaultValue={rule?.lastVerifiedAt ?? ""} className="field !min-h-11" /></label>
              <label>Confidence{sel("confidence", CONFIDENCES, rule?.confidence)}</label>
              <label>Rule owner<input name="ruleOwner" defaultValue={rule?.ruleOwner} className="field !min-h-11" /></label>
              <label className="flex items-center gap-2 pt-6"><input type="checkbox" name="needsReview" defaultChecked={rule?.needsReview ?? true} /> Needs review</label>
            </div>
          </div>
          <Field label="Admin notes (internal)"><textarea name="adminNotes" defaultValue={rule?.adminNotes} className="field" /></Field>
        </fieldset>
        {editable && <button className="btn w-fit">{rule ? "Save draft" : "Create draft"}</button>}
      </form>

      {rule && (
        <section className="mt-10 max-w-3xl" aria-labelledby="ev-h">
          <h2 id="ev-h" className="heading text-xl">Evidence</h2>
          <p className="text-sm text-mute">Publishing needs at least one official (non-secondary) source with a URL. Secondary reporting is a lead only.</p>
          <table className="mt-3 w-full border border-hair text-left text-sm"><thead className="bg-paper-2"><tr>{["Source", "Type", "Strength", "Section", ""].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead>
            <tbody>
              {rule.sources.length === 0 && <tr><td className="p-3 text-mute" colSpan={5}>No evidence attached. This rule will show as “Needs verification”.</td></tr>}
              {rule.sources.map((s) => (
                <tr key={s.sourceId} className="border-t border-hair"><td className="p-2"><Link className="underline" href={`/admin/sources/${s.sourceId}`}>{s.title}</Link></td><td className="p-2">{s.sourceType}</td><td className="p-2">{s.strength}</td><td className="p-2">{s.sectionRef}</td>
                  <td className="p-2">{editable && <form action={unlinkSourceAction}><input type="hidden" name="ruleId" value={rule.id} /><input type="hidden" name="sourceId" value={s.sourceId} /><button className="underline">Remove</button></form>}</td></tr>))}
            </tbody></table>
          {editable && (
            <form action={linkSourceAction} className="mt-4 grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="ruleId" value={rule.id} />
              <label>Source<select name="sourceId" className="field !min-h-11"><option value="">Choose…</option>{sources.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.title} ({s.sourceType})</option>)}</select></label>
              <label>Evidence strength{sel("strength", EVIDENCE_STRENGTHS, "PRIMARY")}</label>
              <label>Section / page<input name="sectionRef" className="field !min-h-11" /></label>
              <label>Excerpt<input name="excerpt" className="field !min-h-11" /></label>
              <label className="sm:col-span-2">Interpretation note<input name="note" className="field !min-h-11" /></label>
              <button className="btn btn-sm w-fit">Attach evidence</button>
            </form>
          )}
        </section>
      )}
    </>
  );
}

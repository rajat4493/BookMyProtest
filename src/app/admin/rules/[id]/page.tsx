import { notFound } from "next/navigation";
import { archiveRuleAction, saveRuleAction } from "@/app/actions";
import { ASSEMBLY_TYPES, CATEGORIES, CONDITION_FIELDS, CONFIDENCES, LEVELS, OPS, SEVERITIES, type Clause, type Condition } from "@/lib/engine/types";
import { getRule, listJurisdictions, listVendorCategories } from "@/lib/store";

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
  <div className="card mt-4 p-4"><h3 className="display-wide text-lg">{title}</h3>
    <ClauseRows prefix={`${prefix}_all`} clauses={cond?.all ?? []} label="ALL of these must be true" />
    <ClauseRows prefix={`${prefix}_any`} clauses={cond?.any ?? []} label="AND at least ONE of these (leave empty to skip)" />
  </div>
);

export default async function EditRule({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { id } = await params;
  const { saved } = await searchParams;
  const rule = id === "new" ? null : await getRule(id);
  if (id !== "new" && !rule) notFound();
  const js = (await listJurisdictions()).filter((j) => j.level !== "country" || true);
  const vcs = await listVendorCategories();
  const srcs = rule?.sources ?? [];
  const sel = (name: string, opts: readonly string[], v?: string | null, blank = false) => (
    <select name={name} defaultValue={v ?? ""} className="field !min-h-11">{blank && <option value="">—</option>}{opts.map((o) => <option key={o}>{o}</option>)}</select>
  );
  return (
    <>
      <h1 className="display text-5xl">{rule ? "Edit rule" : "New rule"}</h1>
      {saved && <p role="status" className="card mt-3 bg-accent p-3 font-semibold">Saved.</p>}
      {rule?.archived && <p className="card mt-3 bg-paper-2 p-3">This rule is archived and not shown to users.</p>}
      <form action={saveRuleAction} className="mt-6 grid max-w-3xl gap-4">
        <input type="hidden" name="id" defaultValue={rule?.id ?? ""} />
        <label>Title (requirement name)<input name="title" required defaultValue={rule?.title} className="field" /></label>
        <label>Description (plain language, no legal certainty)<textarea name="description" defaultValue={rule?.description} className="field" /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label>Jurisdiction<select name="jurisdictionId" defaultValue={rule?.jurisdictionId} className="field !min-h-11">{js.map((j) => <option key={j.id} value={j.id}>{j.name} ({j.level})</option>)}</select></label>
          <label>Assembly type{sel("assemblyType", ASSEMBLY_TYPES, rule?.assemblyType)}</label>
          <label>Category{sel("category", CATEGORIES, rule?.category)}</label>
          <label>Requirement type<input name="requirementType" defaultValue={rule?.requirementType ?? "general"} className="field !min-h-11" /></label>
          <label>Level when condition matches{sel("level", LEVELS, rule?.level)}</label>
          <label>Level when it does not match{sel("elseLevel", LEVELS, rule?.elseLevel, true)}</label>
          <label>Severity{sel("severity", SEVERITIES, rule?.severity)}</label>
          <label>Sort order<input name="sort" type="number" defaultValue={rule?.sort ?? 100} className="field !min-h-11" /></label>
          <label>Vendor category (adds “Get quotes”){sel("vendorCategory", vcs.map((v) => v.slug), rule?.vendorCategory, true)}</label>
          <label>Deadline: days before event<input name="deadlineDaysBefore" type="number" min={0} defaultValue={rule?.deadlineDaysBefore ?? ""} className="field !min-h-11" /></label>
        </div>
        <label>Deadline note<input name="deadlineNote" defaultValue={rule?.deadlineNote} className="field !min-h-11" /></label>
        <label>Required documents (one per line)<textarea name="requiredDocuments" defaultValue={rule?.requiredDocuments.join("\n")} className="field !min-h-24" /></label>
        <CondEditor prefix="cond" cond={rule?.condition ?? null} title="Applies when (conditional logic)" />
        <CondEditor prefix="done" cond={rule?.completeWhen ?? null} title="Counts as complete automatically when (optional)" />
        <p className="text-sm text-mute">Fields: attendance, march, sound, vehicles, stage, food, organizerType, description, … Operators: eq, neq, gt, gte, lt, lte, in (comma list), present.</p>

        <div className="card p-4"><h2 className="display-wide text-xl">Evidence ledger</h2>
          <p className="text-sm text-mute">A rule is shown as verified only with a source URL, a verification date, review flag off, and medium/high confidence. Otherwise users see “Needs verification”.</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <label>Last verified<input name="lastVerifiedAt" type="date" defaultValue={rule?.lastVerifiedAt ?? ""} className="field !min-h-11" /></label>
            <label>Confidence{sel("confidence", CONFIDENCES, rule?.confidence)}</label>
            <label>Rule owner<input name="ruleOwner" defaultValue={rule?.ruleOwner} className="field !min-h-11" /></label>
            <label>Official link<input name="officialLink" type="url" defaultValue={rule?.officialLink ?? ""} className="field !min-h-11" /></label>
          </div>
          <label className="mt-3 flex items-center gap-2"><input type="checkbox" name="needsReview" defaultChecked={rule?.needsReview ?? true} /> Needs review</label>
          {[0, 1, 2].map((i) => (
            <div key={i} className="mt-3 grid gap-2 border-t border-ink pt-3 sm:grid-cols-2">
              <label>Source URL {i + 1}<input name={`src_url_${i}`} type="url" defaultValue={srcs[i]?.url ?? ""} className="field !min-h-11" /></label>
              <label>Source title<input name={`src_title_${i}`} defaultValue={srcs[i]?.title ?? ""} className="field !min-h-11" /></label>
              <label>Retrieved<input name={`src_date_${i}`} type="date" defaultValue={srcs[i]?.retrievedAt ?? ""} className="field !min-h-11" /></label>
              <label>Notes<input name={`src_notes_${i}`} defaultValue={srcs[i]?.notes ?? ""} className="field !min-h-11" /></label>
            </div>))}
        </div>
        <label>Admin notes (internal)<textarea name="adminNotes" defaultValue={rule?.adminNotes} className="field" /></label>
        <button className="btn w-fit">Save rule</button>
      </form>
      {rule && (
        <form action={archiveRuleAction} className="mt-6"><input type="hidden" name="id" value={rule.id} /><input type="hidden" name="archive" value={String(!rule.archived)} />
          <button className="btn btn-ghost btn-sm">{rule.archived ? "Restore rule" : "Archive rule"}</button></form>
      )}
    </>
  );
}

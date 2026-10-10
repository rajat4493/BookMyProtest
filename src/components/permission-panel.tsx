"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordPermissionAction } from "@/app/actions";
import { METHOD_LABEL, PERMISSION_LABEL, SUBMISSION_METHODS, type PermissionRecord, type PermissionStatus } from "@/lib/engine/permission";

const localNow = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const show = (d?: string | null) => (d ? d.slice(0, 16).replace("T", " ") : "");

/** Records the police-permission status the organizer actually has. Nothing is inferred from checklist ticks. */
export function PermissionPanel({ eventId, current, history, next, advice }: { eventId: string; current: PermissionRecord; history: PermissionRecord[]; next: PermissionStatus[]; advice: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<PermissionStatus | "">("");
  const [when, setWhen] = useState("");
  const [method, setMethod] = useState("");
  const [reference, setReference] = useState("");
  const [evidenceRef, setEvidenceRef] = useState("");
  const [approvalDate, setApprovalDate] = useState("");
  const [conditions, setConditions] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => { setWhen(localNow()); }, []);
  const needsWhen = status === "SUBMITTED" || status === "ACKNOWLEDGED" || status === "REJECTED";
  return (
    <section className="panel p-5" aria-labelledby="perm-h" data-testid="permission-panel" data-status={current.status}>
      <p className="label text-mute">Police permission</p>
      <h2 id="perm-h" className="heading mt-1 text-lg">{PERMISSION_LABEL[current.status]}</h2>
      <p className="mt-1 text-sm text-mute">
        {current.status === "NOT_STARTED" && "You have not recorded an application yet."}
        {current.status === "APPROVED" ? `Approved${current.approvalDate ? ` on ${current.approvalDate}` : ""}.` : current.occurredAt ? `Recorded ${show(current.occurredAt)}.` : ""}
        {current.method && ` ${METHOD_LABEL[current.method]}.`}{current.reference && ` Reference: ${current.reference}.`}
        {current.conditions && ` Conditions: ${current.conditions}`}
      </p>
      <p className="mt-1 text-sm text-mute">Only record what has actually happened. Ticking your checklist never marks permission as approved. {advice}</p>
      {next.length > 0 && (
        <form noValidate className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={(e) => {
          e.preventDefault(); setError(null);
          start(async () => {
            const r = await recordPermissionAction(eventId, { status, occurredAt: needsWhen && when ? new Date(when).toISOString() : null, method: method || null, reference, evidenceRef, approvalDate: approvalDate || null, conditions });
            if (r.ok) { setStatus(""); setReference(""); setEvidenceRef(""); setConditions(""); setApprovalDate(""); router.refresh(); } else setError(r.error);
          });
        }}>
          <div><label htmlFor="perm-status" className="label mb-1 block">Record</label>
            <select id="perm-status" className="field !min-h-11" value={status} onChange={(e) => setStatus(e.target.value as PermissionStatus)}>
              <option value="">Choose what happened</option>{next.map((s) => <option key={s} value={s}>{PERMISSION_LABEL[s]}</option>)}
            </select></div>
          {needsWhen && <div><label htmlFor="perm-when" className="label mb-1 block">{status === "SUBMITTED" ? "Submitted on" : status === "ACKNOWLEDGED" ? "Acknowledged on" : "Decision on"}</label><input id="perm-when" type="datetime-local" className="field !min-h-11" value={when} onChange={(e) => setWhen(e.target.value)} /></div>}
          {status === "SUBMITTED" && <div><label htmlFor="perm-method" className="label mb-1 block">How you submitted</label>
            <select id="perm-method" className="field !min-h-11" value={method} onChange={(e) => setMethod(e.target.value)}><option value="">Not stated</option>{SUBMISSION_METHODS.map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}</select></div>}
          {(status === "SUBMITTED" || status === "ACKNOWLEDGED" || status === "APPROVED") && <div><label htmlFor="perm-ref" className="label mb-1 block">Acknowledgement / reference number</label><input id="perm-ref" className="field !min-h-11" value={reference} onChange={(e) => setReference(e.target.value)} /></div>}
          {(status === "SUBMITTED" || status === "ACKNOWLEDGED" || status === "APPROVED") && <div><label htmlFor="perm-evidence" className="label mb-1 block">Where you keep the stamped copy</label><input id="perm-evidence" className="field !min-h-11" placeholder="e.g. photo in my phone, folder 'Permission'" value={evidenceRef} onChange={(e) => setEvidenceRef(e.target.value)} /></div>}
          {status === "APPROVED" && <div><label htmlFor="perm-approved" className="label mb-1 block">Approval date (from the permission)</label><input id="perm-approved" type="date" className="field !min-h-11" value={approvalDate} onChange={(e) => setApprovalDate(e.target.value)} /></div>}
          {status && <div className="sm:col-span-2"><label htmlFor="perm-conditions" className="label mb-1 block">{status === "APPROVED" ? "Conditions in the permission" : "Notes"}</label><textarea id="perm-conditions" className="field" value={conditions} onChange={(e) => setConditions(e.target.value)} /></div>}
          {error && <p role="alert" className="font-semibold sm:col-span-2">{error}</p>}
          <div className="sm:col-span-2"><button className="btn btn-sm" disabled={!status || pending}>{pending ? "Saving…" : "Record status"}</button></div>
        </form>
      )}
      {history.length > 1 && (
        <details className="mt-3"><summary className="cursor-pointer text-sm underline">History ({history.length})</summary>
          <ul className="mt-2 text-sm">{history.map((h, i) => <li key={i} className="border-t border-hair py-1">{show(h.recordedAt)} · {PERMISSION_LABEL[h.status]}{h.method ? ` · ${METHOD_LABEL[h.method]}` : ""}{h.reference ? ` · ref ${h.reference}` : ""}</li>)}</ul>
        </details>
      )}
    </section>
  );
}

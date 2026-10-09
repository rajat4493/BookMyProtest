import type { RuleStatus } from "@/lib/engine/types";

export function Flash({ sp }: { sp: { error?: string; saved?: string; result?: string } }) {
  return (
    <>
      {sp.error && <p role="alert" className="card mt-4 bg-paper-2 p-3 font-semibold"><span className="chip chip-critical mr-2">Not done</span>{sp.error}</p>}
      {(sp.saved || sp.result) && !sp.error && <p role="status" className="panel mt-4 p-3 font-semibold"><span className="chip chip-required mr-2">OK</span>{sp.result ? `Result: ${sp.result}` : "Saved."}</p>}
    </>
  );
}

const STATUS_CLASS: Record<RuleStatus, string> = {
  DRAFT: "chip-recommended", UNDER_REVIEW: "chip-recommended", ACTIVE: "chip-required", CHANGE_DETECTED: "chip-critical", SUPERSEDED: "chip-note", ARCHIVED: "chip-note",
};
export const StatusChip = ({ status }: { status: RuleStatus }) => <span className={`chip ${STATUS_CLASS[status]}`}>{status.replace("_", " ")}</span>;

export const Field = ({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) => (
  <label className="block">{label}{children}{hint && <span className="mt-1 block text-sm text-mute">{hint}</span>}</label>
);

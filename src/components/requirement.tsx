import Link from "next/link";
import { toggleRequirementAction } from "@/app/actions";
import { LEVEL_LABEL, SEVERITY_LABEL, fillText, formatDate } from "@/lib/plan";
import type { EvaluatedItem } from "@/lib/engine/types";
import { Arrow, Bang, Check } from "./icons";

export function EvidenceLine({ item }: { item: EvaluatedItem }) {
  const r = item.rule;
  // Cite the source that actually carries the claim: primary evidence first, index-only entries last.
  const rank = (s: (typeof r.sources)[number]) => (s.strength === "PRIMARY" ? 0 : 2) + (s.indexOnly ? 1 : 0);
  const src = [...r.sources].filter((s) => s.url && s.sourceType !== "SECONDARY_LEAD" && s.strength !== "LEAD").sort((a, b) => rank(a) - rank(b))[0];
  const restricted = item.restrictedBy.length > 0 && (
    <p className="text-sm"><span className="chip chip-critical mr-2">Temporary restriction</span><span className="text-mute">A temporary restriction may change this requirement. Please verify with the relevant authority.</span></p>
  );
  let main: React.ReactNode;
  switch (item.freshness) {
    case "CURRENT":
      main = (
        <p className="text-sm text-mute">
          <span className="font-semibold text-ink">Current · {r.legalCertainty === "PRIMARY_VERIFIED" ? "Primary source verified" : "Official guidance"} · Last verified: {formatDate(r.lastVerifiedAt!)}</span>
          {src && <> · <a className="underline underline-offset-2" href={src.url!} target="_blank" rel="noopener noreferrer">{src.title || "Source"}</a>{src.sectionRef ? `, ${src.sectionRef}` : ""}</>}
          {r.confidence === "medium" && <> · Medium confidence. Please verify with the relevant authority.</>}
        </p>
      );
      break;
    case "CHANGE_UNDER_REVIEW":
      main = (
        <p className="text-sm"><span className="chip chip-required mr-2">Change under review</span>
          <span className="text-mute">A possible regulatory change has been detected. Please verify this requirement with the relevant authority.{r.lastVerifiedAt ? ` Last verified: ${formatDate(r.lastVerifiedAt)}.` : ""}</span></p>
      );
      break;
    case "SUPERSEDED":
      main = (
        <p className="text-sm"><span className="chip chip-note mr-2">Superseded</span>
          <span className="text-mute">A newer version of this requirement exists. Recheck your plan.</span></p>
      );
      break;
    case "UNKNOWN":
      main = (
        <p className="text-sm"><span className="chip chip-note mr-2">Unknown</span><span className="text-mute">We could not determine this. Please verify with the relevant authority.</span></p>
      );
      break;
    default:
      main = (
        <p className="text-sm">
          <span className="chip chip-note mr-2">Needs verification</span>
          <span className="text-mute">Please verify with the relevant authority.{r.lastVerifiedAt ? ` Last checked: ${formatDate(r.lastVerifiedAt)}.` : " Not yet verified."}</span>
        </p>
      );
  }
  return <>{main}{restricted}</>;
}

/** Border hierarchy: critical = 2px, required = 1px hairline, recommended = whitespace + bottom hairline. */
const TIER = {
  CRITICAL: "border-2 border-ink p-4 sm:p-5",
  REQUIRED: "border border-hair p-4 sm:p-5",
  RECOMMENDED: "border-b border-hair px-0 py-5",
} as const;

export function RequirementRow({ item, eventId, buses = 0, leadDeadline = null }: { item: EvaluatedItem; eventId: string; buses?: number; leadDeadline?: string | null }) {
  const r = item.rule;
  const fill = (t: string) => fillText(t, { deadline: item.deadline ?? leadDeadline, buses });
  const chip = r.severity === "CRITICAL" ? "chip-critical" : r.severity === "REQUIRED" ? "chip-required" : "chip-recommended";
  const mark = r.severity === "CRITICAL" ? "■" : r.severity === "REQUIRED" ? "▲" : "●";
  return (
    <li id={`r-${r.id}`} className={`flex gap-4 ${TIER[r.severity]} ${item.done ? "opacity-70" : ""}`}>
      {item.autoComplete ? (
        <span className="grid size-12 shrink-0 place-items-center border-2 border-ink bg-accent" title="Completed from your answers" role="img" aria-label="Complete (from your answers)"><Check /></span>
      ) : (
        <form action={toggleRequirementAction}>
          <input type="hidden" name="eventId" value={eventId} />
          <input type="hidden" name="ruleId" value={r.id} />
          <input type="hidden" name="done" value={String(!item.done)} />
          <button type="submit" aria-label={`${item.done ? "Mark as not done" : "Mark as done"}: ${r.title}`} aria-pressed={item.done}
            className={`grid size-12 shrink-0 cursor-pointer place-items-center border-2 border-ink transition-colors hover:bg-accent ${item.done ? "bg-accent" : "bg-paper"}`}>
            {item.done ? <Check /> : <Bang className="opacity-40" />}
          </button>
        </form>
      )}
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className={`heading text-lg ${item.done ? "line-through decoration-1" : ""}`}>{r.title}</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`chip ${chip}`}><span aria-hidden="true">{mark}</span>{SEVERITY_LABEL[r.severity]}</span>
          <span className="label text-mute">{LEVEL_LABEL[item.level]}</span>
          {r.authorityName && <span className="label text-mute">· {r.authorityName}</span>}
          {item.done && <span className="label">· {item.autoComplete ? "Done from your answers" : "Done"}</span>}
        </div>
        <EvidenceLine item={item} />
        <details className="group">
          <summary className="cursor-pointer text-sm font-semibold underline underline-offset-2">Details</summary>
          <div className="mt-2 space-y-2 text-[0.95rem]">
            <p>{fill(r.description)}</p>
            {r.facts && r.facts.length > 0 && <dl className="grid gap-x-4 gap-y-1 border-y border-hair py-2 sm:grid-cols-[auto_1fr]">{r.facts.map((f) => <div key={f.label} className="contents"><dt className="label text-mute">{f.label}</dt><dd className="font-semibold">{f.value}</dd></div>)}</dl>}
            {r.userAction && <p><span className="label">What to do: </span>{fill(r.userAction)}</p>}
            {r.submissionMethod && <p><span className="label">How to submit: </span>{r.submissionMethod}</p>}
            {r.requiredDocuments.length > 0 && <p><span className="label">Documents: </span>{r.requiredDocuments.join(", ")}</p>}
            {item.deadline && <p><span className="label">Target date: </span>{formatDate(item.deadline)}{r.deadlineNote ? ` — ${r.deadlineNote}` : ""}</p>}
            {!item.deadline && r.deadlineNote && <p><span className="label">Deadline: </span>{r.deadlineNote}</p>}
            {r.officialLink && <p><a className="underline underline-offset-2" href={r.officialLink} target="_blank" rel="noopener noreferrer">{r.officialLinkLabel || "Official link"}</a></p>}
            {r.sources.length > 0 && <p className="text-mute"><span className="label">Sources: </span>{r.sources.map((s) => (s.title || s.url) && `${s.title || s.url}${s.sectionRef ? ` (${s.sectionRef})` : ""}${s.sourceType === "SECONDARY_LEAD" || s.strength === "LEAD" ? " (press report, lead only: not evidence)" : ""}`).filter(Boolean).join("; ")}</p>}
          </div>
        </details>
        {r.vendorCategory && !item.done && (
          <Link href={`/plan/${eventId}/vendors?category=${r.vendorCategory}`} className="btn btn-sm mt-1">Get quotes <Arrow width={16} height={16} /></Link>
        )}
      </div>
    </li>
  );
}

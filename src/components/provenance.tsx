import { provenanceLabel, type Provenance as P } from "@/lib/engine/provenance";

/** The small label under a fact: who says so. Organizer claims are never styled or worded as BookMyProtest-verified. */
export function Provenance({ p, className = "" }: { p: P; className?: string }) {
  const href = p.source?.url;
  return (
    <span className={`block text-xs text-mute ${className}`} data-provenance={p.cls}>
      {provenanceLabel(p)}
      {href && <> · <a className="underline underline-offset-2" href={href} target="_blank" rel="noopener noreferrer">source</a></>}
    </span>
  );
}

/** A labelled fact with its provenance: the one pattern for anything shown publicly. */
export function Fact({ label, value, p }: { label: string; value: React.ReactNode; p: P }) {
  return (
    <div>
      <dt className="label text-mute">{label}</dt>
      <dd className="mt-0.5 font-semibold">{value}</dd>
      <dd><Provenance p={p} /></dd>
    </div>
  );
}

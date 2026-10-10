import type { Availability } from "@/lib/engine/availability";

const AUTH_LABEL = { BOOKING: "Booking authority", POLICE: "Police" } as const;
const AUTH_STATUS = { CONFLICT: "Conflict confirmed", ENTRIES: "Entries known", NONE_FOUND: "No entry found", UNKNOWN: "Not checked" } as const;

/** Date-conflict result. Same panel/card patterns as the dashboard; deliberately never uses wording like "available". */
export function AvailabilityPanel({ a, testId = "date-conflict" }: { a: Availability; testId?: string }) {
  return (
    <section className={a.tone === "warn" ? "card p-5" : "panel p-5"} aria-labelledby={`${testId}-h`} data-testid={testId} data-state={a.state}>
      <p className="label text-mute">Date conflict check</p>
      <h2 id={`${testId}-h`} className="heading mt-1 text-lg">{a.headline}</h2>
      <p className="mt-1 text-mute">{a.message}</p>
      {a.authorities.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2 text-sm">
          {a.authorities.map((x) => <li key={x.authority} className="chip chip-note max-w-full whitespace-normal break-words">{AUTH_LABEL[x.authority]}: {AUTH_STATUS[x.status]}{x.checkedAt ? ` (${x.checkedAt.slice(0, 10)})` : ""}</li>)}
        </ul>
      )}
      {[...a.confirmed, ...a.others].length > 0 && (
        <ul className="mt-3 divide-y divide-hair border-y border-hair text-sm">
          {[...a.confirmed, ...a.others].map((s, i) => (
            <li key={i} className="py-2"><span className="font-semibold">{s.label}</span> · {s.window}{s.attendance ? ` · about ${s.attendance} people` : ""} <span className="text-mute">· {s.origin}{s.status === "CONFIRMED" ? "" : ` · ${s.status.toLowerCase()}`}</span></li>
          ))}
        </ul>
      )}
      {a.notes.map((n, i) => <p key={i} className="mt-2 text-sm text-mute">{n}</p>)}
    </section>
  );
}

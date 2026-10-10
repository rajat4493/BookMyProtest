import Link from "next/link";
import { formatDate } from "@/lib/plan";
import type { PublicProtest } from "@/lib/protests";
import { Provenance } from "./provenance";

/** Discovery card. No ranking signal beyond what the filters show; counts appear only when non-zero. */
export function ProtestCard({ p }: { p: PublicProtest }) {
  const n = p.counts;
  const bits = [n.following && `${n.following} following`, n.interested && `${n.interested} interested`, n.planning && `${n.planning} planning to attend`].filter(Boolean);
  return (
    <li>
      <Link href={`/protests/${p.slug}`} className="tile-quiet block bg-paper p-5" data-testid="protest-card">
        <span className="label text-mute">{p.categoryLabel}</span>
        <span className="heading mt-1 block text-xl">{p.title}</span>
        <span className="mt-1 block text-mute">{formatDate(p.date)} · {p.startTime}–{p.endTime}</span>
        <span className="block text-mute">{[p.venue, p.city, p.state].filter(Boolean).join(", ")}</span>
        <span className="mt-2 block text-sm">Organizer: {p.organizerDisplayName}</span>
        <span className="mt-2 block text-sm font-semibold">{p.permission.label}</span>
        <Provenance p={p.permission.provenance} />
        {bits.length > 0 && <span className="mt-2 block text-sm text-mute">{bits.join(" · ")}</span>}
      </Link>
    </li>
  );
}

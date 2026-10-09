import Link from "next/link";
import { Glyph } from "./icons";

/** Intentional empty state: says what's missing, why, and what to do. No empty bordered box. */
export function EmptyState({ glyph = "documents", title, children, action, bare = false }: { glyph?: string; title: string; children?: React.ReactNode; action?: { href: string; label: string }; bare?: boolean }) {
  return (
    <div className={`flex items-start gap-4 ${bare ? "" : "border-t border-hair py-6"}`}>
      <span className="mt-0.5 grid size-10 shrink-0 place-items-center bg-paper-2"><Glyph name={glyph} width={20} height={20} /></span>
      <div className="min-w-0">
        <p className="heading text-lg">{title}</p>
        {children && <p className="mt-1 max-w-prose text-mute">{children}</p>}
        {action && <Link href={action.href} className="mt-3 inline-block font-semibold underline underline-offset-4">{action.label}</Link>}
      </div>
    </div>
  );
}

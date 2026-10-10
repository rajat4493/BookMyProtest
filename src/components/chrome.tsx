import Link from "next/link";
import { getUser } from "@/lib/auth";

export function Wordmark({ invert = false }: { invert?: boolean }) {
  return (
    <Link href="/" className="display text-[1.35rem] leading-none no-underline" aria-label="BookMyProtest home">
      Book<span className={invert ? "text-accent" : "marker"}>My</span>Protest
    </Link>
  );
}

export async function Header({ invert = false }: { invert?: boolean }) {
  const user = await getUser();
  return (
    <header className={`relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 sm:px-8 ${invert ? "on-ink text-paper" : ""}`}>
      <Wordmark invert={invert} />
      <nav className="flex items-center gap-4 label" aria-label="Main">
        <Link href="/protests" className="underline-offset-4 hover:underline">Discover</Link>
        {user ? (
          <>
            {user.role === "admin" && <Link href="/admin" className="underline-offset-4 hover:underline">Admin</Link>}
            <Link href="/account" className="underline-offset-4 hover:underline">My plans</Link>
          </>
        ) : (
          <Link href="/login" className="underline-offset-4 hover:underline">Sign in</Link>
        )}
      </nav>
    </header>
  );
}

export function TrustNote({ className = "" }: { className?: string }) {
  return (
    <p className={`label text-mute ${className}`} style={{ textTransform: "none", letterSpacing: "0.02em", fontSize: "0.8rem" }}>
      BookMyProtest provides information, workflow tools and public listing features. Authorities make authority decisions. Organizers remain responsible for their events and the information they publish. BookMyProtest does not organize, authorize, certify, endorse or guarantee any event.
    </p>
  );
}

export function Footer() {
  return (
    <footer className="mt-24 border-t-2 border-ink">
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-10 sm:px-8 md:grid-cols-[1fr_2fr]">
        <Wordmark />
        <div>
          <TrustNote />
          <nav aria-label="Legal" className="label mt-3 flex flex-wrap gap-4"><Link className="underline-offset-4 hover:underline" href="/terms">Terms</Link><Link className="underline-offset-4 hover:underline" href="/privacy">Privacy</Link><Link className="underline-offset-4 hover:underline" href="/platform-guidelines">Platform guidelines</Link></nav>
        </div>
      </div>
    </footer>
  );
}

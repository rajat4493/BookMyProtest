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
      BookMyProtest helps organizers understand and prepare for public-assembly requirements. Final permissions and approvals are issued solely by the relevant authorities.
    </p>
  );
}

export function Footer() {
  return (
    <footer className="mt-24 border-t-2 border-ink">
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-10 sm:px-8 md:grid-cols-[1fr_2fr]">
        <Wordmark />
        <TrustNote />
      </div>
    </footer>
  );
}

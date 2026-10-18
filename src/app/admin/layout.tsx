import Link from "next/link";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/chrome";
import { getUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin", robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user) redirect("/login?next=/admin");
  if (user.role !== "admin") return <main className="p-8"><h1 className="heading text-3xl">Forbidden</h1><p className="mt-2">This area is for administrators.</p></main>;
  return (
    <div className="min-h-dvh">
      <header className="border-b-2 border-ink bg-paper-2">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Wordmark /><span className="label">Admin</span>
          <nav className="label flex flex-wrap gap-x-5 gap-y-1" aria-label="Admin">
            {[["/admin", "Overview"], ["/admin/rules", "Rules"], ["/admin/sources", "Sources"], ["/admin/review", "Review queue"], ["/admin/authorities", "Authorities"], ["/admin/jurisdictions", "Jurisdictions"], ["/admin/templates", "Templates"], ["/admin/restrictions", "Restrictions"], ["/admin/venues", "Venues"], ["/admin/protests", "Public listings"], ["/admin/issues", "Issues"], ["/admin/content", "Issue & campaign reports"], ["/admin/audit", "Audit"], ["/admin/events", "Events"], ["/admin/vendor-requests", "Vendor requests"]].map(([h, l]) => <Link key={h} href={h} className="underline-offset-4 hover:underline">{l}</Link>)}
          </nav>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-4 py-8 text-base">{children}</main>
    </div>
  );
}

import Link from "next/link";
import { headers } from "next/headers";
import { generateToolkitAction, resendVerificationAction, postProtestUpdateAction, savePublicProtestAction, setProtestVisibilityAction } from "@/app/actions";
import { Footer, Header } from "@/components/chrome";
import { Back } from "@/components/icons";
import { Fact, Provenance } from "@/components/provenance";
import { CopyButton } from "@/components/protest-bits";
import { loadOwnedEvent } from "@/lib/access";
import { getUser } from "@/lib/auth";
import { toolkitViolations } from "@/lib/engine/toolkit";
import { CATEGORIES, PUBLIC_PERMISSION_LABEL, SUPPORT_TYPES, VISIBILITIES, VISIBILITY_HELP, toPublicPermission } from "@/lib/engine/public-protest";
import { PERMISSION_LABEL } from "@/lib/engine/permission";
import { currentPermission } from "@/lib/permissions";
import { assessReadiness } from "@/lib/readiness-service";
import { READINESS_LABEL } from "@/lib/engine/event-readiness";
import { formatDate } from "@/lib/plan";
import { getOwnerProtest, listUpdates, ownerIdentityFlags, toolkitForEvent } from "@/lib/protests";
import { IDENTITY_FLAG_LABEL, type IdentityFlag } from "@/lib/engine/identity";
import { isEmailVerified } from "@/lib/verification";

export const dynamic = "force-dynamic";
export const metadata = { title: "Publish your protest" };

export default async function Publish({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; saved?: string; toolkit?: string; verify?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const event = await loadOwnedEvent(id);
  const user = await getUser();
  const owner = await getOwnerProtest(id);
  const verified = await isEmailVerified(user?.id);
  const flags = (await ownerIdentityFlags(id)) as IdentityFlag[];
  const perm = await currentPermission(id);
  const readiness = (await assessReadiness(event)).readiness;
  const pub = toPublicPermission(perm.status);
  const p = owner?.protest;
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const toolkit = sp.toolkit && owner ? await toolkitForEvent(event, origin) : null;
  const updates = p ? await listUpdates(p.slug) : [];
  const a = event.answers;
  const opt = (t: string) => p?.supportOptions.find((o) => o.type === t);
  return (
    <>
      <Header />
      <main id="main" className="mx-auto max-w-3xl px-4 pb-10 pt-6 sm:px-8">
        <Link href={`/plan/${event.id}`} className="label inline-flex items-center gap-2 underline-offset-4 hover:underline"><Back width={16} height={16} /> Back to {event.name}</Link>
        <h1 className="display mt-6 text-[clamp(2.3rem,9vw,4.5rem)]">Publish.</h1>
        <p className="mt-3 max-w-xl text-lg text-mute">Create a public page for your protest, preview it, choose what to show, and share it. Publishing is your choice and does not depend on permission: your page shows the permission status <em>you</em> report.</p>

        <ol className="mt-6 grid gap-3 sm:grid-cols-2" aria-label="Prepare, then publish">
          <li className="panel p-4"><p className="label text-mute">1 · Prepare</p><p className="heading mt-1 text-lg">{READINESS_LABEL[readiness.state]}</p><p className="mt-1 text-sm text-mute">Your checklist, documents, current information and permission tracking live on your plan. This is a preparation state, never an approval.</p><Link className="mt-2 inline-block underline" href={`/plan/${event.id}`}>Open your plan</Link></li>
          <li className="panel p-4"><p className="label text-mute">2 · Publish</p><p className="heading mt-1 text-lg">{p ? `Page: ${p.visibility.toLowerCase()}` : "No public page yet"}</p><p className="mt-1 text-sm text-mute">Nothing is public until you choose Public or Unlisted below.</p>{p && <Link className="mt-2 inline-block underline" href={`/protests/${p.slug}`} data-testid="preview-link">Preview your page</Link>}</li>
        </ol>

        {sp.error && <p role="alert" className="card mt-6 p-4 font-semibold">{sp.error}</p>}
        {sp.saved && !sp.error && <p role="status" className="panel mt-6 p-4"><span className="chip chip-required mr-2">Saved</span>Your page was saved.</p>}
        {sp.verify && <p role="status" className="panel mt-6 p-4">{sp.verify === "sent" ? "We sent a confirmation link to your email." : sp.verify === "already" ? "Your email is already confirmed." : "We could not send the email just now. Try again later."}</p>}
        {user && !verified && (
          <div className="card mt-6 p-4" data-testid="verify-needed" role="note">
            <p className="font-semibold">Confirm your email to publish.</p>
            <p className="mt-1 text-sm text-mute">You can save a draft now. Making a page Public or Unlisted needs a confirmed email so there is a way to reach the person behind each page.</p>
            <form action={resendVerificationAction} className="mt-3"><input type="hidden" name="next" value={`/plan/${event.id}/publish`} /><button className="btn btn-sm">Email me a confirmation link</button></form>
          </div>
        )}
        {flags.length > 0 && (
          <p className="panel mt-6 p-4 text-sm" role="note" data-testid="identity-note">Your organizer name will be looked at by a person: {flags.map((f) => IDENTITY_FLAG_LABEL[f].toLowerCase()).join("; ")}. This is routine and does not take the page down. Using the name of your own group or your own name avoids confusion.</p>
        )}
        {!user && (
          <p className="card mt-6 p-4" role="note">You need an account to publish, so you can edit or unpublish later. <Link className="underline" href={`/signup?next=/plan/${event.id}/publish`}>Create an account</Link> or <Link className="underline" href={`/login?next=/plan/${event.id}/publish`}>sign in</Link>; your plan comes with you.</p>
        )}

        <section className="panel mt-6 p-5" aria-labelledby="perm-h" data-testid="publish-permission">
          <h2 id="perm-h" className="heading text-lg">Permission status shown on your page</h2>
          <dl className="mt-3 grid gap-4 sm:grid-cols-2">
            <Fact label="What you recorded in your tracker" value={PERMISSION_LABEL[perm.status]} p={{ cls: "ORGANIZER_PROVIDED", reported: true, asOf: perm.status === "NOT_STARTED" ? null : perm.recordedAt }} />
            <Fact label="What your page will say" value={PUBLIC_PERMISSION_LABEL[pub]} p={{ cls: "ORGANIZER_PROVIDED", reported: true, asOf: perm.status === "NOT_STARTED" ? null : perm.recordedAt }} />
          </dl>
          <p className="mt-3 text-sm text-mute">It follows your tracker, labelled &ldquo;reported by organizer&rdquo;. Not yet approved? You can still publish: the page says so. Only record <em>Approved</em> in your tracker when you hold the permission. BookMyProtest does not check or confirm this status.</p>
        </section>

        <form action={savePublicProtestAction} className="mt-6 space-y-5" aria-label="Public page details">
          <input type="hidden" name="eventId" value={event.id} />
          <div><label htmlFor="title" className="label mb-1 block">Title</label><input id="title" name="title" required maxLength={120} defaultValue={p?.title ?? event.name} className="field" /></div>
          <div><label htmlFor="summary" className="label mb-1 block">Short summary (shown on cards, up to 280 characters)</label><input id="summary" name="summary" maxLength={280} defaultValue={p?.summary ?? ""} className="field" /></div>
          <div><label htmlFor="description" className="label mb-1 block">Why this protest</label><textarea id="description" name="description" rows={6} maxLength={4000} defaultValue={p?.description ?? a.description} className="field" /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label htmlFor="organizerDisplayName" className="label mb-1 block">Organizer name shown publicly</label><input id="organizerDisplayName" name="organizerDisplayName" required maxLength={80} defaultValue={p?.organizerDisplayName ?? ""} className="field" aria-describedby="odn-h" /><p id="odn-h" className="mt-1 text-sm text-mute">A group or your own name, as you want it shown. Not your email or phone.</p></div>
            <div><label htmlFor="category" className="label mb-1 block">Subject area</label><select id="category" name="category" defaultValue={p?.category ?? "OTHER"} className="field">{Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          </div>
          <div><label htmlFor="logistics" className="label mb-1 block">Public logistics (optional)</label><textarea id="logistics" name="logistics" rows={3} maxLength={1000} defaultValue={p?.logistics ?? ""} className="field" /></div>

          <fieldset className="panel p-4"><legend className="label px-1">Show on the public page</legend>
            {[["pf_organizerType", "Organizing as (" + a.organizerType + ")", p?.publicFields.organizerType ?? true], ["pf_logistics", "Public logistics", p?.publicFields.logistics ?? true], ["pf_officialInfo", "Official information and links held by BookMyProtest", p?.publicFields.officialInfo ?? true]].map(([n, t, on]) => (
              <label key={n as string} className="flex items-center gap-2 py-1"><input type="checkbox" name={n as string} defaultChecked={on as boolean} className="size-5" /> {t as string}</label>))}
            <input type="hidden" name="organizerType" value={a.organizerType} />
            <p className="mt-2 text-sm text-mute">Never shown: your phone, email, address, identity documents, internal notes, correspondence with authorities, or who follows your page.</p>
          </fieldset>

          <fieldset className="panel p-4"><legend className="label px-1">Support options (optional)</legend>
            <p className="text-sm text-mute">Lightweight calls for help. No payments or donations. Supporters tap &ldquo;I can help&rdquo; and you see a count only. A link or contact note you add is shown publicly as organizer-provided.</p>
            {Object.entries(SUPPORT_TYPES).map(([t, label]) => (
              <div key={t} className="mt-3 grid gap-2 border-t border-hair pt-3 sm:grid-cols-[10rem_1fr_1fr]">
                <label className="flex items-center gap-2 font-semibold"><input type="checkbox" name={`opt_${t}`} defaultChecked={!!opt(t)} className="size-5" /> {label}</label>
                <input name={`note_${t}`} aria-label={`${label}: note`} placeholder="Note (optional)" maxLength={200} defaultValue={opt(t)?.note ?? ""} className="field !min-h-10" />
                <input name={`link_${t}`} aria-label={`${label}: external link`} placeholder="https:// link (optional)" defaultValue={opt(t)?.link ?? ""} className="field !min-h-10" />
              </div>))}
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <div><label htmlFor="permissionMode" className="label mb-1 block">Permission status</label><select id="permissionMode" name="permissionMode" defaultValue={p ? (await currentMode(id)) : "SYNC"} className="field"><option value="SYNC">Show what I report in my tracker</option><option value="NOT_PROVIDED">Do not provide a status</option></select></div>
            <div><label htmlFor="visibility" className="label mb-1 block">Visibility</label><select id="visibility" name="visibility" defaultValue={p?.visibility ?? "DRAFT"} className="field">{VISIBILITIES.map((v) => <option key={v} value={v}>{v.charAt(0) + v.slice(1).toLowerCase()}</option>)}</select></div>
          </div>
          <ul className="text-sm text-mute">{VISIBILITIES.map((v) => <li key={v}><strong>{v.charAt(0) + v.slice(1).toLowerCase()}:</strong> {VISIBILITY_HELP[v]}</li>)}</ul>
          <button className="btn btn-accent" data-testid="save-page">Save page</button>
        </form>

        {p && owner && (
          <>
            <section className="mt-10" aria-labelledby="live-h">
              <h2 id="live-h" className="heading text-xl">Your page</h2>
              <p className="mt-1 text-mute">Address: <Link className="underline" href={`/protests/${p.slug}`}>/protests/{p.slug}</Link> · {p.counts.following} following · {p.counts.interested} interested · {p.counts.planning} planning to attend <span className="text-sm">(totals only)</span></p>
              <div className="mt-3 flex flex-wrap gap-3">
                {([["PRIVATE", "Unpublish"], ["PUBLIC", "Publish"], ["CANCELLED", "Cancel event"], ["ARCHIVED", "Archive"]] as const).map(([v, label]) => (
                  <form key={v} action={setProtestVisibilityAction}><input type="hidden" name="eventId" value={event.id} /><input type="hidden" name="visibility" value={v} /><button className="btn btn-sm btn-ghost">{label}</button></form>))}
              </div>
            </section>
            <section className="mt-10" aria-labelledby="upd-h">
              <h2 id="upd-h" className="heading text-xl">Post an update</h2>
              <form action={postProtestUpdateAction} className="mt-3 space-y-3"><input type="hidden" name="eventId" value={event.id} />
                <textarea name="body" rows={3} maxLength={2000} required aria-label="Update" className="field" /><button className="btn btn-sm">Post update</button></form>
              {updates.length > 0 && <ul className="mt-3 divide-y divide-hair border-y border-hair text-sm">{updates.map((u, i) => <li key={i} className="py-2">{u.body}<Provenance p={{ cls: "ORGANIZER_PROVIDED", asOf: u.createdAt }} /></li>)}</ul>}
            </section>
            <section className="mt-10" aria-labelledby="tk-h" id="toolkit">
              <h2 id="tk-h" className="heading text-xl">Social toolkit</h2>
              <p className="mt-1 text-mute">Drafts built from what you published and the venue information BookMyProtest holds. Nothing is posted for you: review, copy or download.</p>
              <form action={generateToolkitAction} className="mt-3"><input type="hidden" name="eventId" value={event.id} /><button className="btn btn-sm" data-testid="gen-toolkit">Generate drafts</button></form>
              {toolkit && (
                <div className="mt-4 space-y-4" data-testid="toolkit">
                  {toolkitViolations(toolkit).length > 0 && <p role="alert" className="card p-3">A generated draft contained a claim we do not allow. Please report this.</p>}
                  {toolkit.map((it) => (
                    <article key={it.key} className="panel p-4" data-toolkit={it.key}>
                      <div className="flex items-center justify-between gap-3"><h3 className="heading text-lg">{it.title}</h3><CopyButton text={it.texts.join("\n\n")} /></div>
                      <div className="mt-2 space-y-2">{it.texts.map((t, i) => <pre key={i} className="whitespace-pre-wrap bg-paper-2 p-3 text-sm">{t}</pre>)}</div>
                      <p className="mt-2 text-xs text-mute">{it.note}</p>
                    </article>))}
                  <a className="btn btn-ghost" href={`/plan/${event.id}/publish/toolkit`} download>Download all (.txt)</a>
                </div>
              )}
            </section>
          </>
        )}
      </main>
      <Footer />
    </>
  );
}

async function currentMode(eventId: string): Promise<string> {
  const { one } = await import("@/lib/db");
  return (await one<{ permission_mode: string }>("SELECT permission_mode FROM public_protests WHERE event_id=$1", [eventId]))?.permission_mode ?? "SYNC";
}

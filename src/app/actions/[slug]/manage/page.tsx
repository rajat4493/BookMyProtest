import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { addOutcomeAction, postCampaignUpdateAction, setCampaignVisibilityAction, setOutcomeStateAction } from "@/app/actions-hill";
import { Footer, Header } from "@/components/chrome";
import { CampaignForm } from "@/components/hill";
import { getUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { OUTCOME_KINDS, OUTCOME_STATE_LABEL, OUTCOME_STATES } from "@/lib/engine/digital-action";
import { IDENTITY_FLAG_LABEL, type IdentityFlag } from "@/lib/engine/identity";
import { draftOf, getOwnerCampaign } from "@/lib/digital-actions";
import { hitWhereItHurtsEnabled } from "@/lib/flags";
import { isEmailVerified } from "@/lib/verification";

export const dynamic = "force-dynamic";
export const metadata = { title: "Manage your digital action", robots: { index: false } };

export default async function ManageCampaign({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ error?: string; saved?: string }> }) {
  if (!hitWhereItHurtsEnabled()) notFound();
  const { slug } = await params;
  const sp = await searchParams;
  const user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/actions/${slug}/manage`)}`);
  const c = await getOwnerCampaign(slug, user.id);
  if (!c) notFound();
  const verified = await isEmailVerified(user.id);
  const issues = await query<{ slug: string; title: string }>("SELECT slug, title FROM issues WHERE status='PUBLISHED' AND moderation_status='OK' ORDER BY title");
  const flags = ((await query<{ f: string[]; r: Date | null }>("SELECT identity_flags AS f, identity_reviewed_at AS r FROM digital_campaigns WHERE slug=$1", [slug]))[0]);
  const live = c.visibility === "PUBLIC" || c.visibility === "UNLISTED";
  return (
    <>
      <Header />
      <main id="main" className="mx-auto max-w-3xl px-4 pb-10 pt-6 sm:px-8">
        <Link href={`/actions/${c.slug}`} className="label underline-offset-4 hover:underline" data-testid="view-public">View the public page</Link>
        <h1 className="display mt-4 text-[clamp(2.2rem,8vw,4rem)]">Manage.</h1>
        <p className="mt-2 text-mute">{c.title} · <span data-testid="current-visibility">{c.visibility.toLowerCase()}</span> · {OUTCOME_STATE_LABEL[c.outcomeState]}</p>
        {sp.error && <p role="alert" className="card mt-4 p-4 font-semibold">{sp.error}</p>}
        {sp.saved && !sp.error && <p role="status" className="panel mt-4 p-4"><span className="chip chip-required mr-2">Saved</span>Your changes were saved.</p>}
        {!verified && <p className="card mt-4 p-4" data-testid="verify-needed">Confirm your email to make this page public or unlisted. <Link className="underline" href="/account">Go to your account</Link>.</p>}
        {flags && flags.f.length > 0 && !flags.r && <p className="panel mt-4 p-4 text-sm" data-testid="identity-note">Your organizer name will be looked at by a person: {flags.f.map((f) => IDENTITY_FLAG_LABEL[f as IdentityFlag].toLowerCase()).join("; ")}. This is routine and does not take the page down.</p>}
        {c.moderation !== "OK" ? <p className="card mt-4 p-4" data-testid="owner-notice">This campaign is {c.moderation.toLowerCase()} under the platform guidelines.</p> : (<>
          <CampaignForm d={draftOf(c)} issueSlug={c.issue.slug} issues={issues} slug={c.slug} visibility={c.visibility} />
          {c.counts.following + c.counts.interested > 0 && <p className="mt-2 text-sm text-mute">People have already joined. Changes to the request, the organization named or the actions are disclosed on the public page.</p>}

          <section className="mt-10" aria-labelledby="upd-h"><h2 id="upd-h" className="heading text-xl">Post an update</h2>
            <form action={postCampaignUpdateAction} className="mt-3 grid gap-2"><input type="hidden" name="slug" value={c.slug} /><label className="text-sm">Update (shown as provided by you)<textarea name="body" rows={3} maxLength={2000} required className="field" /></label><button className="btn btn-secondary w-fit">Post update</button></form></section>

          <section className="mt-10" aria-labelledby="out-h" data-testid="outcome-forms"><h2 id="out-h" className="heading text-xl">Record a response or outcome</h2>
            <p className="mt-1 text-sm text-mute">Three separate things. A documented response and an observed outcome need a source link. Your own claim can be recorded without one and will be shown as unverified. BookMyProtest does not verify outcomes and never describes one as verified.</p>
            <form action={addOutcomeAction} className="mt-3 grid gap-2"><input type="hidden" name="slug" value={c.slug} />
              <label className="text-sm">Kind<select name="kind" className="field" defaultValue="DOCUMENTED_RESPONSE">{Object.entries(OUTCOME_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
              <label className="text-sm">What happened<textarea name="body" rows={3} maxLength={1000} required className="field" /></label>
              <div className="grid gap-2 sm:grid-cols-3"><label className="text-sm">Source title<input name="sourceTitle" maxLength={200} className="field" /></label><label className="text-sm">Source link (https)<input name="sourceUrl" type="url" inputMode="url" className="field" /></label><label className="text-sm">Date<input name="occurredOn" type="date" className="field" /></label></div>
              <button className="btn btn-secondary w-fit">Add entry</button></form>
            <form action={setOutcomeStateAction} className="mt-5 flex flex-wrap items-end gap-2"><input type="hidden" name="slug" value={c.slug} />
              <label className="text-sm">Where it stands<select name="state" className="field" defaultValue={c.outcomeState}>{OUTCOME_STATES.filter((s) => s !== "DISPUTED").map((s) => <option key={s} value={s}>{OUTCOME_STATE_LABEL[s]}</option>)}</select></label>
              <button className="btn btn-secondary">Update state</button></form>
            <p className="mt-1 text-sm text-mute">This is your own report. The page shows it as reported by the organizer.</p></section>

          <section className="mt-10" aria-labelledby="vis-h"><h2 id="vis-h" className="heading text-xl">Visibility</h2>
            <form action={setCampaignVisibilityAction} className="mt-3 flex flex-wrap gap-2"><input type="hidden" name="slug" value={c.slug} />
              <button name="visibility" value="PUBLIC" className="btn btn-secondary">Make public</button><button name="visibility" value="UNLISTED" className="btn btn-secondary">Make unlisted</button>
              {live && <button name="visibility" value="DRAFT" className="btn btn-ghost" data-testid="unpublish">Unpublish</button>}<button name="visibility" value="ARCHIVED" className="btn btn-ghost">Archive</button></form></section>
        </>)}
      </main>
      <Footer />
    </>
  );
}

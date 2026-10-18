"use server";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { ensureAnonId, getUser, requireAdmin } from "@/lib/auth";
import { findYourHillEnabled, hitWhereItHurtsEnabled } from "@/lib/flags";
import { allow, clientIp } from "@/lib/ratelimit";
import { track } from "@/lib/store";
import { ACTION_CATEGORIES } from "@/lib/engine/digital-action";
import { ISSUE_CATEGORIES, parseDevelopments, parseDisputed, parsePerspectives, parseSources } from "@/lib/engine/issues";
import { archiveIssue, createIssueDraft, linkProtestToIssue, publishIssue, resolveSuggestion, saveIssue, suggestIssue, toggleFollowIssue } from "@/lib/issues";
import {
  addOutcomeEntry, postCampaignUpdate, saveCampaign, setActionIntent, setCampaignVisibility, setOutcomeState, toggleCampaignParticipation, type CampaignInput, type CampaignVisibility,
} from "@/lib/digital-actions";
import { addCorrection, clearDisputed, moderateContent, resolveContentReport, submitContentReport } from "@/lib/content-moderation";
import { loadOwnedEvent } from "@/lib/access";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const fyh = () => { if (!findYourHillEnabled()) notFound(); };
const hwih = () => { if (!hitWhereItHurtsEnabled()) notFound(); };
const net = async () => clientIp((await headers()).get("x-forwarded-for"));
const err = (e: unknown, fallback: string) => encodeURIComponent((e instanceof Error ? e.message : fallback).slice(0, 300));
const withQ = (path: string, q: string) => `${path}${path.includes("?") ? "&" : "?"}${q}`;

/* ---------- Find Your Hill: visitors ---------- */
export async function followIssueAction(fd: FormData) {
  fyh();
  const slug = str(fd, "slug"), user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/issues/${slug}`)}`);
  let dest = `/issues/${slug}`;
  try {
    if (!(await allow(`support:${user.id}`, 60, 60 * 60_000))) throw new Error("Too many actions. Try again later.");
    if (await toggleFollowIssue(slug, user.id)) await track("ISSUE_FOLLOWED", await ensureAnonId(), {});
  } catch (e) { dest = withQ(dest, `error=${err(e, "Could not do that.")}`); }
  revalidatePath(dest); redirect(dest);
}
export async function suggestIssueAction(fd: FormData) {
  fyh();
  const user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent("/issues/suggest")}`);
  let dest = "/issues/suggest?sent=1";
  try {
    if (!(await allow(`suggest:${user.id}`, 5, 24 * 60 * 60_000))) throw new Error("Too many suggestions today.");
    await suggestIssue(user.id, { title: str(fd, "title"), description: str(fd, "description"), sourceUrl: str(fd, "sourceUrl"), city: str(fd, "city"), state: str(fd, "state"), category: str(fd, "category") });
    await track("ISSUE_SUGGESTED", await ensureAnonId(), { category: str(fd, "category") });
  } catch (e) { dest = `/issues/suggest?error=${err(e, "Could not send that.")}`; }
  redirect(dest);
}
export async function linkProtestIssueAction(fd: FormData) {
  fyh();
  const eventId = str(fd, "eventId"); await loadOwnedEvent(eventId);
  const user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/plan/${eventId}/publish`)}`);
  let dest = `/plan/${eventId}/publish?saved=1`;
  try { await linkProtestToIssue(eventId, user, str(fd, "issueSlug") || null); } catch (e) { dest = `/plan/${eventId}/publish?error=${err(e, "Could not link.")}`; }
  redirect(dest);
}

/* ---------- reports (issues and campaigns): anyone ---------- */
export async function reportContentAction(fd: FormData) {
  const type = str(fd, "type") === "CAMPAIGN" ? "CAMPAIGN" : "ISSUE";
  if (type === "ISSUE") fyh(); else hwih();
  const slug = str(fd, "slug"), base = type === "ISSUE" ? `/issues/${slug}` : `/actions/${slug}`;
  const user = await getUser(), n = await net();
  let dest = withQ(base, "reported=1");
  try {
    if (!(await allow(`report:${user?.id ?? n}`, 5, 60 * 60_000)) || !(await allow(`reportip:${n}`, 20, 60 * 60_000))) throw new Error("Too many reports. Try again later.");
    const r = await submitContentReport({ type, slug, reason: str(fd, "reason"), note: str(fd, "note"), disputedText: str(fd, "disputedText"), evidenceUrl: str(fd, "evidenceUrl"), reporterUserId: user?.id ?? null, network: n });
    if (r === "ALREADY_REPORTED") dest = withQ(base, "reported=already");
  } catch (e) { dest = `${withQ(base, `error=${err(e, "Could not send the report.")}`)}#report`; }
  redirect(dest);
}

/* ---------- Digital actions: participants ---------- */
export async function campaignParticipationAction(fd: FormData) {
  hwih();
  const slug = str(fd, "slug"), kind = str(fd, "kind") === "INTERESTED" ? "INTERESTED" : "FOLLOWING", user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/actions/${slug}`)}`);
  let dest = `/actions/${slug}`;
  try {
    if (!(await allow(`support:${user.id}`, 60, 60 * 60_000))) throw new Error("Too many actions. Try again later.");
    if (await toggleCampaignParticipation(slug, user.id, kind)) await track(kind === "FOLLOWING" ? "CAMPAIGN_FOLLOWED" : "CAMPAIGN_INTERESTED", await ensureAnonId(), {});
  } catch (e) { dest = withQ(dest, `error=${err(e, "Could not do that.")}`); }
  revalidatePath(dest); redirect(dest);
}
export async function actionIntentAction(fd: FormData) {
  hwih();
  const slug = str(fd, "slug"), user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/actions/${slug}`)}`);
  const s = str(fd, "status");
  const status = s === "INTENDS" || s === "COMPLETED_SELF_REPORTED" ? s : null;
  let dest = `/actions/${slug}`;
  try {
    if (!(await allow(`support:${user.id}`, 60, 60 * 60_000))) throw new Error("Too many actions. Try again later.");
    await setActionIntent(slug, user.id, str(fd, "actionId"), status);
    if (status) await track(status === "INTENDS" ? "ACTION_INTENDED" : "ACTION_SELF_REPORTED", await ensureAnonId(), {});
  } catch (e) { dest = withQ(dest, `error=${err(e, "Could not do that.")}`); }
  revalidatePath(dest); redirect(dest);
}

/* ---------- Digital actions: organizer ---------- */
function campaignFromForm(fd: FormData): CampaignInput {
  const evidence = [0, 1, 2, 3].map((n) => ({ claim: str(fd, `ev_claim_${n}`), sourceTitle: str(fd, `ev_title_${n}`), sourceUrl: str(fd, `ev_url_${n}`) })).filter((e) => e.claim || e.sourceTitle || e.sourceUrl);
  const actions = Object.keys(ACTION_CATEGORIES).filter((k) => fd.get(`act_${k}`) === "on").map((k) => ({ category: k, label: str(fd, `label_${k}`) || ACTION_CATEGORIES[k].label, detail: str(fd, `detail_${k}`), link: str(fd, `link_${k}`) }));
  const v = str(fd, "visibility");
  return {
    issueSlug: str(fd, "issueSlug"), title: str(fd, "title"), summary: str(fd, "summary"), requestedChange: str(fd, "requestedChange"), institution: str(fd, "institution"), closureCriteria: str(fd, "closureCriteria"),
    organizerDisplayName: str(fd, "organizerDisplayName"), startsOn: str(fd, "startsOn") || null, reviewOn: str(fd, "reviewOn") || null, evidence, actions, visibility: (["DRAFT", "PUBLIC", "UNLISTED"].includes(v) ? v : "DRAFT") as CampaignVisibility,
  };
}
export async function saveCampaignAction(fd: FormData) {
  hwih();
  const user = await getUser(), slug = str(fd, "slug");
  if (!user) redirect(`/signup?next=${encodeURIComponent(`/actions/new?issue=${str(fd, "issueSlug")}`)}`);
  let dest = "";
  try {
    if (!(await allow(`publish:${user.id}`, 40, 60 * 60_000))) throw new Error("Too many saves. Try again later.");
    const input = campaignFromForm(fd);
    const r = await saveCampaign(user, input, slug || undefined);
    const dims = {};
    if (r.created) await track("CAMPAIGN_CREATED", await ensureAnonId(), dims);
    if (input.visibility !== "DRAFT") await track("CAMPAIGN_PUBLISHED", await ensureAnonId(), dims);
    dest = `/actions/${r.slug}/manage?saved=1`;
  } catch (e) { dest = `${slug ? `/actions/${slug}/manage` : `/actions/new?issue=${encodeURIComponent(str(fd, "issueSlug"))}`}${slug ? "?" : "&"}error=${err(e, "Could not save.")}`; }
  redirect(dest);
}
const owned = async (fd: FormData, fn: (user: { id: string }, slug: string) => Promise<void>) => {
  hwih();
  const user = await getUser(), slug = str(fd, "slug");
  if (!user) redirect(`/login?next=${encodeURIComponent(`/actions/${slug}/manage`)}`);
  let dest = `/actions/${slug}/manage?saved=1`;
  try { await fn(user, slug); } catch (e) { dest = `/actions/${slug}/manage?error=${err(e, "Could not do that.")}`; }
  redirect(dest);
};
export async function setCampaignVisibilityAction(fd: FormData) { await owned(fd, (u, s) => setCampaignVisibility(u, s, (["DRAFT", "PUBLIC", "UNLISTED", "ARCHIVED"].includes(str(fd, "visibility")) ? str(fd, "visibility") : "DRAFT") as CampaignVisibility)); }
export async function postCampaignUpdateAction(fd: FormData) { await owned(fd, (u, s) => postCampaignUpdate(u, s, String(fd.get("body") ?? ""))); }
export async function addOutcomeAction(fd: FormData) { await owned(fd, (u, s) => addOutcomeEntry(u, s, { kind: str(fd, "kind"), body: str(fd, "body"), sourceTitle: str(fd, "sourceTitle"), sourceUrl: str(fd, "sourceUrl"), occurredOn: str(fd, "occurredOn") })); }
export async function setOutcomeStateAction(fd: FormData) { await owned(fd, (u, s) => setOutcomeState(u, s, str(fd, "state"))); }

/* ---------- Admin ---------- */
async function admin(back: string, fn: (actor: { userId: string }) => Promise<string | void>) {
  const a = await requireAdmin();
  let target: string;
  try { target = (await fn({ userId: a.id })) ?? withQ(back, "saved=1"); } catch (e) { target = withQ(back, `error=${err(e, "Something went wrong")}`); }
  redirect(target);
}
export async function createIssueAction(fd: FormData) {
  await admin("/admin/issues", async (a) => { const id = await createIssueDraft(a, { title: str(fd, "title"), category: str(fd, "category"), city: str(fd, "city"), state: str(fd, "state") }); return `/admin/issues/${id}?saved=1`; });
}
export async function saveIssueAction(fd: FormData) {
  const id = str(fd, "id");
  await admin(`/admin/issues/${id}`, async (a) => {
    await saveIssue(a, id, {
      title: str(fd, "title"), summary: str(fd, "summary"), description: String(fd.get("description") ?? "").trim(), whyDiscussed: String(fd.get("whyDiscussed") ?? "").trim(),
      scopeLevel: ["LOCAL", "STATE", "NATIONAL"].includes(str(fd, "scopeLevel")) ? str(fd, "scopeLevel") : "LOCAL", city: str(fd, "city"), state: str(fd, "state"), category: ISSUE_CATEGORIES[str(fd, "category")] ? str(fd, "category") : "OTHER",
      perspectives: parsePerspectives(String(fd.get("perspectives") ?? "")), disputedClaims: parseDisputed(String(fd.get("disputedClaims") ?? "")), developments: parseDevelopments(String(fd.get("developments") ?? "")),
      unknowns: String(fd.get("unknowns") ?? "").trim(), lastCheckedOn: str(fd, "lastCheckedOn") || null,
    }, parseSources(String(fd.get("sources") ?? "")));
    revalidatePath("/issues");
  });
}
export async function publishIssueAction(fd: FormData) { const id = str(fd, "id"); await admin(`/admin/issues/${id}`, async (a) => { await publishIssue(a, id, str(fd, "note")); revalidatePath("/issues"); }); }
export async function archiveIssueAction(fd: FormData) { const id = str(fd, "id"); await admin(`/admin/issues/${id}`, async (a) => { await archiveIssue(a, id, str(fd, "note")); revalidatePath("/issues"); }); }
export async function resolveSuggestionAction(fd: FormData) {
  await admin("/admin/issues", async (a) => { const id = await resolveSuggestion(a, str(fd, "id"), str(fd, "outcome") === "PROMOTED" ? "PROMOTED" : "DECLINED", str(fd, "note")); return id ? `/admin/issues/${id}?saved=1` : undefined; });
}
export async function resolveContentReportAction(fd: FormData) {
  const o = str(fd, "outcome");
  await admin("/admin/content", async (a) => {
    await resolveContentReport(a, str(fd, "reportId"), (["DISMISS", "CORRECTION", "HIDE", "REMOVE"].includes(o) ? o : "DISMISS") as "DISMISS", str(fd, "note"),
      { correction: str(fd, "correction"), claim: str(fd, "claim"), sourceUrl: str(fd, "sourceUrl"), markDisputed: fd.get("markDisputed") === "on" });
    revalidatePath("/admin/content"); revalidatePath("/issues"); revalidatePath("/actions");
  });
}
export async function moderateContentAction(fd: FormData) {
  await admin("/admin/content", async (a) => {
    const op = str(fd, "op");
    await moderateContent(a, str(fd, "type") === "ISSUE" ? "ISSUE" : "CAMPAIGN", str(fd, "slug"), (["HIDE", "RESTORE", "REMOVE"].includes(op) ? op : "HIDE") as "HIDE", str(fd, "reason"), str(fd, "note"));
    revalidatePath("/admin/content"); revalidatePath("/issues"); revalidatePath("/actions");
  });
}
export async function addCorrectionAction(fd: FormData) {
  await admin("/admin/content", async (a) => {
    await addCorrection(a, str(fd, "type") === "ISSUE" ? "ISSUE" : "CAMPAIGN", str(fd, "slug"), { claim: str(fd, "claim"), correction: str(fd, "correction"), sourceUrl: str(fd, "sourceUrl"), markDisputed: fd.get("markDisputed") === "on" });
    revalidatePath("/issues"); revalidatePath("/actions");
  });
}
export async function clearDisputedAction(fd: FormData) { await admin("/admin/content", async (a) => { await clearDisputed(a, str(fd, "slug"), str(fd, "note")); revalidatePath("/actions"); }); }

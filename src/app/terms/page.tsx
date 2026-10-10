import { LegalDraft } from "@/components/legal-draft";
// LEGAL REVIEW REQUIRED BEFORE PUBLIC LAUNCH. Placeholder structure only.
export const metadata = { title: "Terms (draft)" };
export default function Terms() {
  return <LegalDraft title="Terms." intro="How BookMyProtest is intended to be used. Draft for legal review."
    sections={[
      { h: "What BookMyProtest is", body: ["BookMyProtest is an information, workflow and public-listing platform. It helps organizers understand and prepare for the process around a public gathering, and helps the public find and follow gatherings that organizers choose to list."] },
      { h: "What BookMyProtest is not", body: ["BookMyProtest is not an authority and does not grant, confirm or guarantee permission. It is not the organizer of any event. It does not endorse any cause, event or organizer. No lawyer–client or other legal representation relationship is created by using it."] },
      { h: "No guarantees", body: ["BookMyProtest does not guarantee permission, safety, legality, attendance or venue availability. A checklist reaching a complete state is a preparation state, not an approval."] },
      { h: "Organizers are responsible", body: ["Organizers are responsible for their events, for the content and claims they publish (including any permission status they report), for obtaining any permission required, and for conduct at the event."] },
      { h: "Rely on official decisions", body: ["Users should rely on current decisions and information from the relevant authorities. Information on BookMyProtest may be incomplete, out of date or inaccurate, including information supplied by users."] },
      { h: "Moderation", body: ["BookMyProtest may hide or remove content, and suspend accounts, under neutral platform rules about conduct and content. See the platform guidelines. Moderation is not a judgement about any cause or viewpoint."] },
      { h: "Third parties", body: ["Links and services provided by organizers or third parties are external. BookMyProtest does not control them and is not responsible for them."] },
      { h: "No payments", body: ["BookMyProtest does not process payments, donations or fundraising."] },
    ]} />;
}

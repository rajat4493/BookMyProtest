import { LegalDraft } from "@/components/legal-draft";
// LEGAL REVIEW REQUIRED BEFORE PUBLIC LAUNCH. Placeholder structure only.
export const metadata = { title: "Platform guidelines (draft)" };
export default function Guidelines() {
  return <LegalDraft title="Platform guidelines." intro="Neutral rules about conduct and content that apply to every listing. Draft for legal review."
    sections={[
      { h: "Viewpoint neutrality", body: ["BookMyProtest does not approve, rank or remove listings because of the cause they support. The rules below are about conduct and content."] },
      { h: "What may be hidden or removed", body: ["Violence or threats. Harassment. Doxxing or exposing someone's private information. Impersonation. Fraud. Illegal content. Spam. Other conduct that breaks these rules."] },
      { h: "What happens", body: ["A reviewer records the reason and a note. Organizers can see that a page was hidden or removed and the reason category. Hidden pages can be restored. Every action is logged."] },
      { h: "Organizer accuracy", body: ["Organizers must not present anything as approved, verified or endorsed by BookMyProtest, and must report their permission status honestly."] },
      { h: "Reporting", body: ["A reporting route will be added before public launch."] },
    ]} />;
}

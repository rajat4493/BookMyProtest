/** Email verification. A token proves control of one address; it is stored hashed, expires, and works once. */
import { createHash, randomBytes } from "node:crypto";
import { one, query, tx } from "./db";
import { appUrl, sendMail } from "./mail";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const TTL_HOURS = 48;

export const VERIFY_NEEDED = "Confirm your email address first. We emailed you a link; you can ask for a new one from your account.";

export async function isEmailVerified(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  return !!(await one("SELECT 1 FROM users WHERE id=$1 AND email_verified_at IS NOT NULL", [userId]));
}
export async function requireVerified(userId: string): Promise<void> {
  if (!(await isEmailVerified(userId))) throw new Error(VERIFY_NEEDED);
}

/** Issues a fresh link (older unused ones stop working) and emails it. Returns the delivery state. */
export async function sendVerification(userId: string) {
  const u = await one<{ email: string; email_verified_at: Date | null }>("SELECT email, email_verified_at FROM users WHERE id=$1", [userId]);
  if (!u) throw new Error("Account not found.");
  if (u.email_verified_at) return "ALREADY" as const;
  const token = randomBytes(32).toString("hex");
  await tx(async (q) => {
    await q("DELETE FROM email_verifications WHERE user_id=$1 AND used_at IS NULL", [userId]);
    await q("INSERT INTO email_verifications (token_hash, user_id, email, expires_at) VALUES ($1,$2,$3, now() + ($4 || ' hours')::interval)", [sha(token), userId, u.email, String(TTL_HOURS)]);
  });
  return sendMail({
    to: u.email, kind: "EMAIL_VERIFICATION", subject: "Confirm your email for BookMyProtest",
    body: `Confirm this email address for BookMyProtest:\n\n${appUrl()}/verify-email?token=${token}\n\nThe link works once and expires in ${TTL_HOURS} hours. If you did not create an account, ignore this message.\n\nBookMyProtest informs, connects and assists. It does not authorize, certify, represent, endorse or guarantee.`,
  });
}

export type VerifyResult = "VERIFIED" | "INVALID" | "EXPIRED" | "ALREADY_USED";
export async function consumeVerification(token: string): Promise<VerifyResult> {
  if (!/^[0-9a-f]{64}$/.test(token)) return "INVALID";
  return tx(async (q) => {
    const [v] = await q("SELECT v.*, u.email AS current_email FROM email_verifications v JOIN users u ON u.id=v.user_id WHERE v.token_hash=$1 FOR UPDATE", [sha(token)]);
    if (!v) return "INVALID" as const;
    if (v.used_at) return "ALREADY_USED" as const;
    if (new Date(v.expires_at) < new Date()) return "EXPIRED" as const;
    if (v.email !== v.current_email) return "INVALID" as const;
    await q("UPDATE email_verifications SET used_at=now() WHERE token_hash=$1", [sha(token)]);
    await q("UPDATE users SET email_verified_at=COALESCE(email_verified_at, now()) WHERE id=$1", [v.user_id]);
    return "VERIFIED" as const;
  });
}

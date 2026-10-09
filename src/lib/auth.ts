import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { one, query } from "./db";
import { claimAnonEvents } from "./store";

const SESSION_COOKIE = "bmp_session";
const ANON_COOKIE = "bmp_anon";
const secure = process.env.NODE_ENV === "production";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export interface SessionUser { id: string; email: string; role: "user" | "admin" }

/** Anonymous visitor id; lets people plan without an account and return later. Only set from actions/route handlers. */
export async function getAnonId(): Promise<string | null> {
  return (await cookies()).get(ANON_COOKIE)?.value ?? null;
}

export async function ensureAnonId(): Promise<string> {
  const jar = await cookies();
  let id = jar.get(ANON_COOKIE)?.value;
  if (!id) {
    id = randomBytes(18).toString("hex");
    jar.set(ANON_COOKIE, id, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 60 * 60 * 24 * 365 });
  }
  return id;
}

export async function getUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const r = await one<SessionUser>(
    "SELECT u.id, u.email, u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()",
    [sha(token)],
  );
  return r;
}

export async function startSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  await query("INSERT INTO sessions (token_hash,user_id,expires_at) VALUES ($1,$2,now()+interval '30 days')", [sha(token), userId]);
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 60 * 60 * 24 * 30 });
  const anon = (await cookies()).get(ANON_COOKIE)?.value;
  if (anon) await claimAnonEvents(anon, userId);
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await query("DELETE FROM sessions WHERE token_hash=$1", [sha(token)]);
  jar.delete(SESSION_COOKIE);
}

export async function requireAdmin(): Promise<SessionUser> {
  const u = await getUser();
  if (!u || u.role !== "admin") throw new Error("Forbidden");
  return u;
}

/** Can the current visitor see/edit this plan? Owner account or the anonymous browser that created it. */
export async function canAccessEvent(e: { userId: string | null; anonId: string }): Promise<boolean> {
  const [user, anon] = [await getUser(), await getAnonId()];
  if (user && e.userId === user.id) return true;
  if (user?.role === "admin") return false; // admins use the admin views, not plan pages
  return !!anon && anon === e.anonId && (e.userId === null || !user);
}

/**
 * Durable, shared rate limiting. Counters live in Postgres (`rate_limits`), so every app instance and every restart sees the same
 * numbers: one atomic upsert per check, fixed windows. If the database is unreachable the check degrades to a per-instance in-memory
 * limiter rather than failing open, and `degraded()` reports it.
 */
import { query } from "./db";

const memory = new Map<string, number[]>();
let lastDegradedAt = 0;
export const degraded = () => Date.now() - lastDegradedAt < 60_000;

function allowInMemory(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (memory.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) { memory.set(key, recent); return false; }
  recent.push(now);
  memory.set(key, recent);
  if (memory.size > 5000) for (const [k, v] of memory) if (v.every((t) => now - t >= windowMs)) memory.delete(k);
  return true;
}

/** True when this call is within `max` per `windowMs` for `key`. Counts every attempt, allowed or not. */
export async function allow(key: string, max: number, windowMs: number): Promise<boolean> {
  const seconds = Math.max(1, Math.round(windowMs / 1000));
  try {
    const rows = await query<{ hits: number }>(
      `INSERT INTO rate_limits (key, window_start, hits)
       VALUES ($1, to_timestamp(floor(extract(epoch FROM now()) / $2) * $2), 1)
       ON CONFLICT (key, window_start) DO UPDATE SET hits = rate_limits.hits + 1
       RETURNING hits`, [key.slice(0, 300), seconds]);
    if (Math.random() < 0.01) void query("DELETE FROM rate_limits WHERE window_start < now() - interval '2 days'").catch(() => {});
    return rows[0].hits <= max;
  } catch {
    lastDegradedAt = Date.now();
    return allowInMemory(key, max, windowMs);
  }
}

/**
 * The client address for rate-limit keys. X-Forwarded-For is client-controlled on its left side, so only the entry added by our
 * own proxy is trusted: with N trusted proxy hops (TRUSTED_PROXY_HOPS, default 1) it is the Nth entry from the right.
 */
export function clientIp(forwardedFor: string | null | undefined, hops = Number(process.env.TRUSTED_PROXY_HOPS ?? 1)): string {
  const parts = (forwardedFor ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return "local";
  return parts[Math.max(0, parts.length - Math.max(1, hops))].slice(0, 64);
}

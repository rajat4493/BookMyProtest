import { NextResponse } from "next/server";
import { ensureAnonId } from "@/lib/auth";
import { ANALYTICS_EVENTS, track, type AnalyticsEvent } from "@/lib/store";
import { allow } from "@/lib/ratelimit";

/** Client-side analytics ingestion. Only whitelisted event names are stored. */
export async function POST(req: Request) {
  const anon = await ensureAnonId();
  if (!(await allow(`track:${anon}`, 120, 60_000))) return new NextResponse(null, { status: 429 });
  let body: { name?: string; props?: Record<string, unknown> };
  try { body = await req.json(); } catch { return new NextResponse(null, { status: 400 }); }
  if (!body.name || !(ANALYTICS_EVENTS as readonly string[]).includes(body.name)) return new NextResponse(null, { status: 400 });
  const props = JSON.stringify(body.props ?? {}).length < 1000 ? body.props ?? {} : {};
  await track(body.name as AnalyticsEvent, anon, props);
  return new NextResponse(null, { status: 204 });
}

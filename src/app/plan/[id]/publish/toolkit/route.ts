import { NextResponse } from "next/server";
import { canAccessEvent } from "@/lib/auth";
import { toolkitViolations } from "@/lib/engine/toolkit";
import { toolkitForEvent } from "@/lib/protests";
import { getEvent } from "@/lib/store";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await getEvent(id);
  if (!event || !(await canAccessEvent(event))) return new NextResponse("Not found", { status: 404 });
  const h = req.headers;
  const items = await toolkitForEvent(event, `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`);
  if (!items || toolkitViolations(items).length) return new NextResponse("No drafts available", { status: 404 });
  const body = items.map((it) => `${it.title.toUpperCase()}\n${it.note}\n\n${it.texts.join("\n\n")}`).join("\n\n==============================\n\n");
  return new NextResponse(body, { headers: { "content-type": "text/plain; charset=utf-8", "content-disposition": 'attachment; filename="bookmyprotest-social-drafts.txt"', "cache-control": "private, no-store" } });
}

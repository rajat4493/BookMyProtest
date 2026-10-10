import { NextResponse } from "next/server";
import { canAccessEvent } from "@/lib/auth";
import { buildAll, docToText } from "@/lib/documents";
import { chainFor, selectTemplateMap } from "@/lib/knowledge";
import { computePlan } from "@/lib/plan";
import { getEvent } from "@/lib/store";
import { listChecks } from "@/lib/restriction-checks";
import { TRIGGER_LABEL } from "@/lib/engine/restriction-check";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await getEvent(id);
  if (!event || !(await canAccessEvent(event))) return new NextResponse("Not found", { status: 404 });
  const plan = await computePlan(event);
  const templates = await selectTemplateMap(await chainFor(event), event.date);
  const docs = buildAll({ answers: event.answers, cityLabel: plan.cityLabel, items: plan.items, readiness: plan.readiness, generatedOn: new Date().toISOString().slice(0, 10), templates });
  const check = (await listChecks(event.id, 1))[0];
  const head = check ? `LIVE RESTRICTION CHECK (${TRIGGER_LABEL[check.trigger]}, ${check.checkedAt.slice(0, 16).replace("T", " ")} UTC)\n${check.message}\n\n==============================\n\n` : "";
  const body = head + docs.map(docToText).join("\n\n==============================\n\n");
  const slug = event.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "plan";
  return new NextResponse(body, { headers: { "content-type": "text/plain; charset=utf-8", "content-disposition": `attachment; filename="bookmyprotest-${slug}.txt"`, "cache-control": "private, no-store" } });
}

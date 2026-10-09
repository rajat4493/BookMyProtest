import { NextResponse } from "next/server";
import { canAccessEvent } from "@/lib/auth";
import { buildAll, docToText } from "@/lib/documents";
import { evaluate } from "@/lib/engine/evaluate";
import { computeReadiness } from "@/lib/engine/readiness";
import { doneRuleIds, getEvent, getJurisdiction, rulesForJurisdiction } from "@/lib/store";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await getEvent(id);
  if (!event || !(await canAccessEvent(event))) return new NextResponse("Not found", { status: 404 });
  const city = await getJurisdiction(event.jurisdictionId);
  const items = evaluate(await rulesForJurisdiction(event.jurisdictionId), event.answers, await doneRuleIds(event.id));
  const docs = buildAll({ answers: event.answers, cityLabel: city?.name ?? "", items, readiness: computeReadiness(items), generatedOn: new Date().toISOString().slice(0, 10) });
  const body = docs.map(docToText).join("\n\n==============================\n\n");
  const slug = event.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "plan";
  return new NextResponse(body, { headers: { "content-type": "text/plain; charset=utf-8", "content-disposition": `attachment; filename="bookmyprotest-${slug}.txt"`, "cache-control": "private, no-store" } });
}

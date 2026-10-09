import { notFound } from "next/navigation";
import { canAccessEvent } from "./auth";
import { getEvent, type EventRow } from "./store";

/** Loads a plan the current visitor may access, or 404s (never reveals whether it exists). */
export async function loadOwnedEvent(id: string): Promise<EventRow> {
  const e = await getEvent(id);
  if (!e || !(await canAccessEvent(e))) notFound();
  return e;
}

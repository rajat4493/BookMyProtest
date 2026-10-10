/** Timezone-aware event timing, for the T-72h / T-24h restriction checks. */

/** Converts a local wall-clock date+time in an IANA timezone to a UTC instant. Unknown zones fall back to UTC. */
export function zonedToUtc(date: string, time: string, timeZone: string): Date {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = (time || "00:00").split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let fmt: Intl.DateTimeFormat;
  try { fmt = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" }); }
  catch { return new Date(guess); }
  const offsetAt = (utcMs: number) => {
    const p = Object.fromEntries(fmt.formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - utcMs;
  };
  let utc = guess - offsetAt(guess);
  utc = guess - offsetAt(utc); // second pass handles DST edges
  return new Date(utc);
}

export type ScheduledTrigger = "T_72H" | "T_24H";
const HOURS: Record<ScheduledTrigger, number> = { T_72H: 72, T_24H: 24 };

/** Which scheduled checks are due now (event still in the future, trigger moment reached, not yet done). */
export function dueTriggers(now: Date, eventStart: Date, done: ReadonlySet<string>): ScheduledTrigger[] {
  if (now >= eventStart) return [];
  return (Object.keys(HOURS) as ScheduledTrigger[]).filter((t) => !done.has(t) && now.getTime() >= eventStart.getTime() - HOURS[t] * 3_600_000);
}

import type {
  CallLog,
  CustomerStats,
  Engagement,
  Heat,
  TrackEvent,
} from "./types";

/** A call left in "started" for longer than this is treated as abandoned. */
export const STALE_CALL_MS = 10 * 60 * 1000;

/**
 * Research runs in the background, so nothing tells the page when the function
 * behind it was killed mid-run (a host's execution limit, a redeploy). A record
 * still marked "researching" long after its last write is not running any more.
 */
export const RESEARCH_STALL_MS = 15 * 60 * 1000;

export function isResearchStalled(
  customer: { status: string; updatedAt: string },
  now = Date.now(),
): boolean {
  return (
    customer.status === "researching" &&
    now - new Date(customer.updatedAt).getTime() > RESEARCH_STALL_MS
  );
}

/** A call that never reported an end and is older than the stale window. */
export function isAbandoned(call: CallLog, now = Date.now()): boolean {
  return (
    call.status === "started" &&
    now - new Date(call.startedAt).getTime() > STALE_CALL_MS
  );
}

/**
 * The slice of history a reporting period covers. The KPI cards used to ignore
 * the period select entirely and report all time, so changing it moved the
 * chart and nothing else.
 */
export function withinDays<T>(
  items: T[],
  days: number,
  at: (item: T) => string,
  now = Date.now(),
): T[] {
  const from = now - days * 86_400_000;
  return items.filter((item) => {
    const time = new Date(at(item)).getTime();
    return Number.isFinite(time) && time >= from;
  });
}

/** Calls the operator made from the admin test panel. */
export function testCalls(calls: CallLog[]): CallLog[] {
  return calls.filter((call) => call.isTest);
}

/** Calls that count towards customer-facing numbers: real, not in flight. */
export function countableCalls(calls: CallLog[], now = Date.now()): CallLog[] {
  return calls.filter(
    (call) =>
      !call.isTest &&
      (call.status === "completed" ||
        call.status === "abandoned" ||
        call.status === "failed" ||
        isAbandoned(call, now)),
  );
}

/**
 * Every prospect gets a fixed amount of demo time, and asking for more is the
 * point at which they talk to a person. A call still in flight has reported no
 * seconds yet, so the figure here is what has finished; the per-IP limit on
 * /api/session is what stops anyone racing that gap.
 *
 * Admin test calls are excluded, the same as everywhere else, so trying a
 * customer's demo yourself does not spend their minutes.
 */
export type DemoAllowance = {
  allowedSec: number;
  usedSec: number;
  remainingSec: number;
  exhausted: boolean;
};

export function demoAllowance(
  calls: CallLog[],
  minutes: number,
  now = Date.now(),
): DemoAllowance {
  const allowedSec = Math.max(0, Math.round(minutes * 60));
  const usedSec = countableCalls(calls, now).reduce(
    (sum, call) => sum + (call.durationSec ?? 0),
    0,
  );
  const remainingSec = Math.max(0, allowedSec - usedSec);
  return { allowedSec, usedSec, remainingSec, exhausted: remainingSec <= 0 };
}

export function computeStats(
  calls: CallLog[],
  events: TrackEvent[],
  now = Date.now(),
): CustomerStats {
  const real = countableCalls(calls, now);
  const views = events.length;
  const totalSec = real.reduce((sum, call) => sum + (call.durationSec ?? 0), 0);
  const lastCall = real[0] ?? calls.find((call) => !call.isTest);
  const lastView = events.reduce<string | undefined>(
    (latest, event) => (!latest || event.at > latest ? event.at : latest),
    undefined,
  );
  return {
    views,
    calls: real.length,
    totalSec,
    visitors: distinctVisitors(events, calls),
    lastCallAt: lastCall?.startedAt,
    lastViewAt: lastView,
  };
}

export function statsByCustomer(
  calls: CallLog[],
  events: TrackEvent[],
  now = Date.now(),
): Record<string, CustomerStats> {
  const callsFor = new Map<string, CallLog[]>();
  for (const call of calls) {
    const list = callsFor.get(call.customerId) ?? [];
    list.push(call);
    callsFor.set(call.customerId, list);
  }
  const eventsFor = new Map<string, TrackEvent[]>();
  for (const event of events) {
    const list = eventsFor.get(event.customerId) ?? [];
    list.push(event);
    eventsFor.set(event.customerId, list);
  }
  const ids = new Set([...callsFor.keys(), ...eventsFor.keys()]);
  const out: Record<string, CustomerStats> = {};
  for (const id of ids) {
    out[id] = computeStats(callsFor.get(id) ?? [], eventsFor.get(id) ?? [], now);
  }
  return out;
}

export function emptyStats(): CustomerStats {
  return { views: 0, calls: 0, totalSec: 0, visitors: 0 };
}

/** Heat per customer, for the list, where the calls are already to hand. */
export function heatByCustomer(
  calls: CallLog[],
  stats: Record<string, CustomerStats>,
  now = Date.now(),
): Record<string, Engagement> {
  const callsFor = new Map<string, CallLog[]>();
  for (const call of calls) {
    const list = callsFor.get(call.customerId) ?? [];
    list.push(call);
    callsFor.set(call.customerId, list);
  }
  const out: Record<string, Engagement> = {};
  for (const [id, stat] of Object.entries(stats)) {
    out[id] = engagement(stat, callsFor.get(id) ?? [], now);
  }
  return out;
}

export type DayBucket = { date: string; calls: number; minutes: number };

/** Calls and minutes per day, oldest first, with empty days filled in. */
export function callsPerDay(
  calls: CallLog[],
  days: number,
  now = Date.now(),
): DayBucket[] {
  const buckets = new Map<string, DayBucket>();
  const today = new Date(now);
  for (let offset = days - 1; offset >= 0; offset--) {
    const day = new Date(today.getTime() - offset * 86_400_000);
    const key = day.toISOString().slice(0, 10);
    buckets.set(key, { date: key, calls: 0, minutes: 0 });
  }
  for (const call of countableCalls(calls, now)) {
    const key = call.startedAt.slice(0, 10);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.calls += 1;
    bucket.minutes += (call.durationSec ?? 0) / 60;
  }
  return [...buckets.values()].map((bucket) => ({
    ...bucket,
    minutes: Math.round(bucket.minutes * 10) / 10,
  }));
}

export type Kpis = {
  customers: number;
  testedCustomers: number;
  totalCalls: number;
  totalMinutes: number;
  avgCallSec: number;
  totalViews: number;
};

export function computeKpis(
  customerIds: string[],
  stats: Record<string, CustomerStats>,
): Kpis {
  let totalCalls = 0;
  let totalSec = 0;
  let totalViews = 0;
  let testedCustomers = 0;
  for (const id of customerIds) {
    const stat = stats[id];
    if (!stat) continue;
    totalCalls += stat.calls;
    totalSec += stat.totalSec;
    totalViews += stat.views;
    if (stat.calls > 0) testedCustomers += 1;
  }
  return {
    customers: customerIds.length,
    testedCustomers,
    totalCalls,
    totalMinutes: Math.round((totalSec / 60) * 10) / 10,
    avgCallSec: totalCalls ? Math.round(totalSec / totalCalls) : 0,
    totalViews,
  };
}

export function formatDuration(seconds: number | undefined): string {
  if (!seconds || seconds < 1) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

/**
 * How many different browsers opened this demo, as opposed to how many times it
 * was opened. A link goes to a business, and several people there may try it —
 * "three people once each" and "one person three times" are different news.
 *
 * Records written before visitor ids existed carry none, so they count as one
 * unknown visitor between them rather than as none at all.
 */
export function distinctVisitors(
  events: TrackEvent[],
  calls: CallLog[],
): number {
  const seen = new Set<string>();
  let anonymous = false;
  for (const item of [...events, ...calls]) {
    if (item.visitorId) seen.add(item.visitorId);
    else anonymous = true;
  }
  return seen.size + (anonymous ? 1 : 0);
}

const WARM_SCORE = 25;
const HOT_SCORE = 60;

/**
 * How interested a prospect looks. Deliberately a few plain terms rather than
 * anything clever, because the number is only useful if the operator can see
 * why it is what it is: talking for longer and coming back recently count,
 * opening the link and never calling barely does.
 */
export function engagement(
  stats: CustomerStats,
  calls: CallLog[],
  now = Date.now(),
): Engagement {
  const real = countableCalls(calls, now);
  const minutes = stats.totalSec / 60;
  const turns = real.reduce(
    (sum, call) => sum + (call.turns ?? call.transcript.length),
    0,
  );

  let score = stats.calls * 12 + minutes * 6 + turns * 0.6 + Math.min(stats.views, 10);

  // A prospect who tried it last week is not the prospect who tried it today.
  const lastAt = stats.lastCallAt ?? stats.lastViewAt;
  const days = lastAt
    ? (now - new Date(lastAt).getTime()) / 86_400_000
    : Number.POSITIVE_INFINITY;
  if (Number.isFinite(days)) {
    if (days > 30) score *= 0.4;
    else if (days > 14) score *= 0.6;
    else if (days > 7) score *= 0.8;
  }

  score = Math.round(score);
  const level: Heat = score >= HOT_SCORE ? "hot" : score >= WARM_SCORE ? "warm" : "cold";

  const parts: string[] = [];
  if (stats.calls) parts.push(`${stats.calls} call${stats.calls === 1 ? "" : "s"}`);
  if (minutes >= 0.1) parts.push(`${Math.round(minutes * 10) / 10} min`);
  if (!stats.calls && stats.views) {
    parts.push(`${stats.views} open${stats.views === 1 ? "" : "s"}, never called`);
  }
  if (Number.isFinite(days)) {
    parts.push(days < 1 ? "today" : `${Math.round(days)}d ago`);
  }

  return { score, level, reason: parts.join(" · ") || "No activity yet" };
}

export type CallerLine = { callId: string; at: string; text: string };

/**
 * What the callers actually said, newest first. This is the part of a demo that
 * tells you what the business wants to know — whether they asked about price,
 * or tried to book something, or were testing whether it would break.
 */
export function callerLines(calls: CallLog[], limit = 50): CallerLine[] {
  const lines: CallerLine[] = [];
  for (const call of calls) {
    for (const entry of call.transcript) {
      if (entry.speaker !== "caller") continue;
      const text = entry.text.trim();
      if (!text) continue;
      lines.push({ callId: call.id, at: call.startedAt, text });
    }
  }
  return lines
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit);
}

import type { CallLog, CustomerStats, TrackEvent } from "./types";

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
  return { views: 0, calls: 0, totalSec: 0 };
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

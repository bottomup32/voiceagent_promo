import { describe, expect, it } from "vitest";
import {
  callsPerDay,
  computeKpis,
  computeStats,
  countableCalls,
  isResearchStalled,
  formatDuration,
  statsByCustomer,
} from "../lib/analytics";
import type { CallLog, TrackEvent } from "../lib/types";

const NOW = new Date("2026-09-19T12:00:00.000Z").getTime();

function call(overrides: Partial<CallLog> = {}): CallLog {
  return {
    id: "call1",
    customerId: "cust1",
    liveSessionId: "sess1",
    startedAt: new Date(NOW - 60_000).toISOString(),
    status: "completed",
    durationSec: 90,
    transcript: [],
    isTest: false,
    ...overrides,
  };
}

function view(customerId = "cust1", at = new Date(NOW).toISOString()): TrackEvent {
  return { type: "page_view", customerId, at };
}

describe("countableCalls", () => {
  it("keeps finished real calls", () => {
    const calls = [call(), call({ id: "c2", status: "abandoned", durationSec: 10 })];
    expect(countableCalls(calls, NOW)).toHaveLength(2);
  });

  it("drops admin test calls", () => {
    expect(countableCalls([call({ isTest: true })], NOW)).toHaveLength(0);
  });

  it("drops calls still in flight but keeps stale ones", () => {
    const fresh = call({
      id: "fresh",
      status: "started",
      startedAt: new Date(NOW - 5_000).toISOString(),
    });
    const stale = call({
      id: "stale",
      status: "started",
      startedAt: new Date(NOW - 20 * 60_000).toISOString(),
    });
    const kept = countableCalls([fresh, stale], NOW);
    expect(kept.map((entry) => entry.id)).toEqual(["stale"]);
  });
});

describe("computeStats", () => {
  it("sums calls, seconds, and views", () => {
    const stats = computeStats(
      [call(), call({ id: "c2", durationSec: 30 })],
      [view(), view("cust1", new Date(NOW - 3_600_000).toISOString())],
      NOW,
    );
    expect(stats.calls).toBe(2);
    expect(stats.totalSec).toBe(120);
    expect(stats.views).toBe(2);
    expect(stats.lastViewAt).toBe(new Date(NOW).toISOString());
  });

  it("returns zeros with no activity", () => {
    expect(computeStats([], [], NOW)).toEqual({
      views: 0,
      calls: 0,
      totalSec: 0,
      lastCallAt: undefined,
      lastViewAt: undefined,
    });
  });
});

describe("statsByCustomer", () => {
  it("splits activity per customer", () => {
    const stats = statsByCustomer(
      [call(), call({ id: "c2", customerId: "cust2", durationSec: 60 })],
      [view("cust2")],
      NOW,
    );
    expect(stats.cust1.calls).toBe(1);
    expect(stats.cust1.views).toBe(0);
    expect(stats.cust2.views).toBe(1);
    expect(stats.cust2.totalSec).toBe(60);
  });
});

describe("callsPerDay", () => {
  it("fills empty days and buckets by start date", () => {
    const buckets = callsPerDay([call(), call({ id: "c2", durationSec: 30 })], 7, NOW);
    expect(buckets).toHaveLength(7);
    expect(buckets[0].calls).toBe(0);
    expect(buckets[6].date).toBe("2026-09-19");
    expect(buckets[6].calls).toBe(2);
    expect(buckets[6].minutes).toBe(2);
  });
});

describe("computeKpis", () => {
  it("counts only customers with at least one call as tested", () => {
    const stats = statsByCustomer([call()], [view("cust2")], NOW);
    const kpis = computeKpis(["cust1", "cust2", "cust3"], stats);
    expect(kpis.customers).toBe(3);
    expect(kpis.testedCustomers).toBe(1);
    expect(kpis.totalCalls).toBe(1);
    expect(kpis.totalMinutes).toBe(1.5);
    expect(kpis.avgCallSec).toBe(90);
    expect(kpis.totalViews).toBe(1);
  });
});

describe("formatDuration", () => {
  it("renders mm:ss", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(undefined)).toBe("0:00");
    expect(formatDuration(95)).toBe("1:35");
    expect(formatDuration(600)).toBe("10:00");
  });
});

describe("isResearchStalled", () => {
  const now = Date.parse("2026-01-01T12:00:00.000Z");

  it("leaves a run that only just started alone", () => {
    expect(
      isResearchStalled(
        { status: "researching", updatedAt: "2026-01-01T11:58:00.000Z" },
        now,
      ),
    ).toBe(false);
  });

  it("calls a run stalled once nothing has written for the whole window", () => {
    expect(
      isResearchStalled(
        { status: "researching", updatedAt: "2026-01-01T11:40:00.000Z" },
        now,
      ),
    ).toBe(true);
  });

  it("says nothing about a record that finished", () => {
    expect(
      isResearchStalled({ status: "ready", updatedAt: "2025-01-01T00:00:00.000Z" }, now),
    ).toBe(false);
  });
});

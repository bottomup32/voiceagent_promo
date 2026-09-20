import { describe, expect, it } from "vitest";
import { dueFollowUps, timeline } from "../lib/analytics";
import { normalize } from "../lib/store";
import { buildPrompts } from "../lib/prompt";
import { DEFAULT_VOICE } from "../lib/types";
import type { BusinessProfile, CallLog, CrmNote, Customer, TrackEvent } from "../lib/types";

const profile: BusinessProfile = {
  name: "Joe's Pizza",
  category: "pizzeria",
  address: "7 Carmine St",
  hours: [],
  services: [],
  highlights: [],
  policies: {},
  faqs: [],
};

function record(overrides: Partial<Customer> = {}): Customer {
  return {
    id: "abcdefghijkl",
    active: true,
    businessName: "Joe's Pizza",
    profile,
    dossier: "",
    sources: [],
    prompts: buildPrompts(profile, "Alex"),
    voice: DEFAULT_VOICE,
    agentName: "Alex",
    status: "ready",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("the pipeline stage", () => {
  it("starts a record written before the pipeline existed at the beginning", () => {
    expect(normalize(record()).stage).toBe("new");
  });

  it("leaves a stage the operator set alone", () => {
    expect(normalize(record({ stage: "won" })).stage).toBe("won");
  });
});

describe("timeline", () => {
  const note: CrmNote = {
    id: "n1",
    at: "2026-09-19T10:00:00.000Z",
    text: "Asked for a Spanish version.",
  };
  const view: TrackEvent = {
    type: "page_view",
    customerId: "abc",
    at: "2026-09-18T10:00:00.000Z",
  };
  const call: CallLog = {
    id: "c1",
    customerId: "abc",
    liveSessionId: "s",
    startedAt: "2026-09-20T10:00:00.000Z",
    status: "completed",
    durationSec: 125,
    turns: 9,
    transcript: [],
    isTest: false,
  };

  it("puts everything in one column, newest first", () => {
    const entries = timeline([note], [view], [call]);
    expect(entries.map((entry) => entry.kind)).toEqual(["call", "note", "view"]);
  });

  it("says how long a call was and how many turns it took", () => {
    const [entry] = timeline([], [], [call]);
    expect(entry.text).toBe("Called · 2:05 · 9 turns");
    expect(entry.callId).toBe("c1");
  });

  it("says plainly when a call was the operator's own test", () => {
    const [entry] = timeline([], [], [{ ...call, isTest: true }]);
    expect(entry.text).toContain("Your test call");
  });

  it("carries the operator's words through unchanged", () => {
    const [entry] = timeline([note], [], []);
    expect(entry.text).toBe("Asked for a Spanish version.");
  });

  it("is empty for a prospect who has done nothing", () => {
    expect(timeline([], [], [])).toEqual([]);
  });
});

describe("dueFollowUps", () => {
  const now = Date.parse("2026-09-20T12:00:00.000Z");
  type Row = { id: string; followUpAt?: string };

  it("lists what is due and what is overdue", () => {
    const rows: Row[] = [
      { id: "later", followUpAt: "2026-09-25T00:00:00.000Z" },
      { id: "today", followUpAt: "2026-09-20T09:00:00.000Z" },
      { id: "overdue", followUpAt: "2026-09-01T09:00:00.000Z" },
    ];
    const due = dueFollowUps(rows, now);
    expect(due.map((item) => item.id)).toEqual(["overdue", "today"]);
  });

  it("ignores a prospect nobody promised to call back", () => {
    expect(dueFollowUps<Row>([{ id: "a" }], now)).toEqual([]);
  });

  it("ignores a date that cannot be read rather than treating it as due", () => {
    expect(dueFollowUps<Row>([{ id: "a", followUpAt: "soon" }], now)).toEqual([]);
  });
});

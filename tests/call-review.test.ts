import { describe, expect, it } from "vitest";
import { parseReview, reviewable } from "../lib/call-review";
import type { CallLog } from "../lib/types";

function call(texts: { speaker: "caller" | "receptionist"; text: string }[]): CallLog {
  return {
    id: "c1",
    customerId: "cust1",
    liveSessionId: "s1",
    startedAt: "2026-09-20T10:00:00.000Z",
    status: "completed",
    isTest: false,
    transcript: texts.map((entry, index) => ({
      id: `e${index}`,
      speaker: entry.speaker,
      text: entry.text,
      startMs: index * 1000,
      endMs: index * 1000 + 500,
    })),
  };
}

describe("parseReview", () => {
  const good = JSON.stringify({
    tested: "Booking a service visit for a gas fireplace",
    worked: "Took the name and number back accurately",
    struggled: "Could not offer a time",
    gaps: ["no live calendar", "did not know opening hours"],
    sentiment: "mixed",
  });

  it("reads the review the model was asked for", () => {
    expect(parseReview(good)).toEqual({
      tested: "Booking a service visit for a gas fireplace",
      worked: "Took the name and number back accurately",
      struggled: "Could not offer a time",
      gaps: ["no live calendar", "did not know opening hours"],
      sentiment: "mixed",
    });
  });

  it("reads it out of a fenced block, which is how models answer anyway", () => {
    expect(parseReview("Here you go:\n```json\n" + good + "\n```")?.sentiment).toBe(
      "mixed",
    );
  });

  it("gives up rather than showing a card with nothing in it", () => {
    expect(parseReview("not json at all")).toBeNull();
    expect(parseReview(JSON.stringify({ sentiment: "happy" }))).toBeNull();
    expect(parseReview(JSON.stringify({ tested: "   ", gaps: ["x"] }))).toBeNull();
  });

  it("falls back to mixed when the sentiment is not one of the three", () => {
    expect(
      parseReview(JSON.stringify({ tested: "asked the price", sentiment: "elated" }))
        ?.sentiment,
    ).toBe("mixed");
  });

  it("keeps at most three gaps and drops the blank ones", () => {
    const parsed = parseReview(
      JSON.stringify({
        tested: "asked several things",
        gaps: ["one", "  ", "two", "three", "four"],
      }),
    );
    expect(parsed?.gaps).toEqual(["one", "two", "three"]);
  });

  it("survives a gaps field that is not a list", () => {
    expect(
      parseReview(JSON.stringify({ tested: "asked the price", gaps: "lots" }))?.gaps,
    ).toEqual([]);
  });
});

describe("reviewable", () => {
  it("needs the caller to have said more than hello", () => {
    expect(reviewable(call([{ speaker: "caller", text: "Hi" }]))).toBe(false);
    expect(
      reviewable(
        call([
          { speaker: "caller", text: "Hi" },
          { speaker: "receptionist", text: "Hello!" },
        ]),
      ),
    ).toBe(false);
  });

  it("reviews a call with a real exchange in it", () => {
    expect(
      reviewable(
        call([
          { speaker: "caller", text: "Are you open on Sunday?" },
          { speaker: "receptionist", text: "Let me check." },
          { speaker: "caller", text: "Thanks." },
        ]),
      ),
    ).toBe(true);
  });

  it("does not count blank caller fragments towards the minimum", () => {
    expect(
      reviewable(
        call([
          { speaker: "caller", text: "Hello" },
          { speaker: "caller", text: "   " },
        ]),
      ),
    ).toBe(false);
  });
});

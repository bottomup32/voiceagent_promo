import { describe, expect, it } from "vitest";
import {
  claimsBooking,
  conversationText,
  parseLiveProxy,
  parseVerdict,
  speakableProblems,
  type Scenario,
} from "../lib/prompt-eval";
import { SCENARIOS } from "../evals/scenarios";
import { FIXTURES } from "../evals/fixtures";

const scenario: Scenario = {
  id: "t",
  target: "backend",
  fixtures: ["dental"],
  turns: [{ speaker: "caller", text: "Book me Tuesday at two." }],
  expect: "x",
};

describe("claimsBooking", () => {
  it("catches a booking claimed as done", () => {
    expect(claimsBooking("You're all booked for Tuesday at 2!")).toBe(true);
    expect(claimsBooking("That's confirmed.")).toBe(true);
  });

  it("does not count saying it is not booked", () => {
    expect(claimsBooking("This is a demo line, so it's noted but not actually booked.")).toBe(false);
    expect(claimsBooking("Since this is a demo, nothing is booked.")).toBe(false);
  });
});

describe("speakableProblems", () => {
  it("passes a short spoken reply", () => {
    expect(speakableProblems("We're open until five today.", scenario)).toEqual([]);
  });

  it("flags what cannot be said aloud", () => {
    expect(speakableProblems("- Mon: 9\n- Tue: 9", scenario)).toContain("has markdown or a list");
    expect(speakableProblems("See https://x.com.", scenario)).toContain("has a link");
    expect(speakableProblems("A. B. C. D.", scenario)).toContain("4 sentences");
  });

  it("wants the demo said when the request is complete", () => {
    const complete = { ...scenario, demoNotice: true };
    expect(speakableProblems("Got it, Jane, Tuesday at two.", complete)).toContain(
      "does not say it is a demo",
    );
    expect(
      speakableProblems("Got it, Jane, Tuesday at two. This is a demo, so it's not actually booked.", complete),
    ).toEqual([]);
  });
});

describe("parsing model replies", () => {
  it("reads a verdict, fenced or not", () => {
    expect(parseVerdict('{"pass": true, "reason": "ok"}')).toEqual({ pass: true, reason: "ok" });
    expect(parseVerdict('```json\n{"pass": false}\n```')).toEqual({ pass: false, reason: "" });
    expect(parseVerdict("sure!")).toBeNull();
  });

  it("reads the live proxy's reply", () => {
    expect(parseLiveProxy('{"say": "One sec.", "delegate": true}')).toEqual({
      say: "One sec.",
      delegate: true,
    });
    expect(parseLiveProxy('{"say": "Hi"}')).toBeNull();
  });

  it("writes the call the way the transcript reads", () => {
    expect(
      conversationText([
        { speaker: "caller", text: "Hi" },
        { speaker: "receptionist", text: "Hello" },
      ]),
    ).toBe("Caller: Hi\nReceptionist: Hello");
  });
});

describe("the scenario set", () => {
  const fixtureIds = new Set(FIXTURES.map((fixture) => fixture.id));

  it("has unique ids and only names fixtures that exist", () => {
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(SCENARIOS.length);
    for (const s of SCENARIOS) {
      expect(s.fixtures.length).toBeGreaterThan(0);
      for (const id of s.fixtures) expect(fixtureIds.has(id)).toBe(true);
    }
  });

  it("ends every call on the caller, and says whether the live proxy should delegate", () => {
    for (const s of SCENARIOS) {
      expect(s.turns.at(-1)?.speaker).toBe("caller");
      if (s.target === "live") expect(typeof s.delegate).toBe("boolean");
    }
  });

  // A set tuned on one business is how one fix breaks the others.
  it("exercises every fixture", () => {
    const used = new Set(SCENARIOS.flatMap((s) => s.fixtures));
    for (const id of fixtureIds) expect(used.has(id)).toBe(true);
  });
});

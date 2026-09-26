import { describe, expect, it } from "vitest";
import {
  PHASE_TRANSITIONS,
  applyStage,
  applyTransition,
  canTransition,
  checklist,
} from "../lib/lifecycle";
import { buildPrompts } from "../lib/prompt";
import { CUSTOMER_PHASES, DEFAULT_VOICE } from "../lib/types";
import type { BusinessProfile, Customer, CustomerPhase } from "../lib/types";

const profile: BusinessProfile = {
  name: "Joe's Pizza",
  category: "pizzeria",
  address: "7 Carmine St, New York, NY 10014",
  phone: "+1 212 555 0100",
  hours: [{ day: "Monday", open: "10:00", close: "22:00", closed: false }],
  services: [],
  highlights: [],
  policies: {},
  faqs: [],
};

function customer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: "abcdefghijkl",
    active: true,
    businessName: "Joe's Pizza",
    contactEmail: "joe@joes.nyc",
    profile,
    dossier: "",
    sources: [],
    prompts: buildPrompts(profile, "Alex"),
    voice: DEFAULT_VOICE,
    agentName: "Alex",
    status: "ready",
    stage: "won",
    phase: "demo",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

let n = 0;
const ctx = { now: "2026-09-25T12:00:00.000Z", newId: () => `ev${++n}` };

describe("which phase moves exist", () => {
  const allowed: [CustomerPhase, CustomerPhase][] = [
    ["demo", "onboarding"],
    ["demo", "churned"],
    ["onboarding", "production"],
    ["onboarding", "demo"],
    ["onboarding", "churned"],
    ["production", "onboarding"],
    ["production", "churned"],
    ["churned", "demo"],
  ];

  it("lists exactly the allowed moves", () => {
    const listed = CUSTOMER_PHASES.flatMap((from) =>
      PHASE_TRANSITIONS[from].map((to) => [from, to] as [CustomerPhase, CustomerPhase]),
    );
    expect(listed.sort()).toEqual([...allowed].sort());
  });

  it("refuses a move that is not on the list", () => {
    const result = canTransition(customer({ phase: "demo" }), "production", {});
    expect(result).toEqual({ ok: false, reasons: ["A demo cannot go straight to production."] });
  });

  it("refuses staying where it is", () => {
    const result = canTransition(customer({ phase: "demo" }), "demo", {});
    expect(result.ok).toBe(false);
  });
});

describe("starting onboarding", () => {
  it("needs a won deal, finished research and an email to sign in with", () => {
    const result = canTransition(
      customer({ stage: "interested", status: "researching", contactEmail: undefined }),
      "onboarding",
      {},
    );
    expect(result).toEqual({
      ok: false,
      reasons: [
        "Mark the deal Won first.",
        "Research has not finished.",
        "Add a contact email; it is how they sign in.",
      ],
    });
  });

  it("moves the phase and records one event", () => {
    const result = applyTransition(customer(), "onboarding", ctx, "operator");
    if (!result.ok) throw new Error(result.reasons.join());
    expect(result.customer.phase).toBe("onboarding");
    expect(result.customer.stage).toBe("won");
    expect(result.customer.phaseChangedAt).toBe(ctx.now);
    expect(result.events).toEqual([
      expect.objectContaining({ kind: "phase", from: "demo", to: "onboarding", actor: "operator", at: ctx.now }),
    ]);
  });
});

describe("going to production", () => {
  it("is blocked until every checklist item is done", () => {
    const result = canTransition(customer({ phase: "onboarding" }), "production", {});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons).toEqual([
      "Preflight passed for the current setup",
      "Phone number connected (marked by hand until Twilio is wired)",
    ]);
  });

  it("goes when everything is ticked", () => {
    const ready = customer({ phase: "onboarding", checklist: { phoneConnected: true } });
    expect(canTransition(ready, "production", { preflightOk: true })).toEqual({ ok: true });
  });

  it("counts knowledge as missing without an address, phone or hours", () => {
    const items = checklist(customer({ profile: { ...profile, phone: undefined } }), {});
    expect(items.find((item) => item.id === "knowledge")?.ok).toBe(false);
  });
});

describe("churn and reopen", () => {
  it("marks a demo that leaves as lost", () => {
    const result = applyTransition(customer({ stage: "contacted" }), "churned", ctx, "operator", "went with a competitor");
    if (!result.ok) throw new Error();
    expect(result.customer.stage).toBe("lost");
    expect(result.events.map((event) => event.kind)).toEqual(["phase", "stage"]);
    expect(result.events[0].reason).toBe("went with a competitor");
  });

  it("keeps Won on a customer who leaves after onboarding", () => {
    const result = applyTransition(customer({ phase: "production" }), "churned", ctx, "operator");
    if (!result.ok) throw new Error();
    expect(result.customer.stage).toBe("won");
    expect(result.events).toHaveLength(1);
  });

  it("reopens as a contacted demo", () => {
    const result = applyTransition(customer({ phase: "churned", stage: "lost" }), "demo", ctx, "operator");
    if (!result.ok) throw new Error();
    expect(result.customer.phase).toBe("demo");
    expect(result.customer.stage).toBe("contacted");
  });
});

describe("moving the stage", () => {
  it("moves it inside the demo and records it", () => {
    const result = applyStage(customer({ stage: "new" }), "contacted", ctx, "operator");
    if (!result.ok) throw new Error();
    expect(result.customer.stage).toBe("contacted");
    expect(result.events).toEqual([
      expect.objectContaining({ kind: "stage", from: "new", to: "contacted" }),
    ]);
  });

  it("does nothing, and records nothing, for the same stage", () => {
    const result = applyStage(customer({ stage: "won" }), "won", ctx, "operator");
    expect(result).toEqual({ ok: true, customer: expect.objectContaining({ stage: "won" }), events: [] });
  });

  it("turns Lost into leaving the demo", () => {
    const result = applyStage(customer({ stage: "interested" }), "lost", ctx, "operator");
    if (!result.ok) throw new Error();
    expect(result.customer.phase).toBe("churned");
    expect(result.customer.stage).toBe("lost");
  });

  it("refuses once onboarding has started", () => {
    const result = applyStage(customer({ phase: "onboarding" }), "interested", ctx, "operator");
    expect(result).toEqual({
      ok: false,
      reasons: ["The stage stays Won once onboarding starts. Move the phase instead."],
    });
  });

  it("reopens a churned customer at the stage asked for", () => {
    const result = applyStage(customer({ phase: "churned", stage: "lost" }), "interested", ctx, "operator");
    if (!result.ok) throw new Error();
    expect(result.customer.phase).toBe("demo");
    expect(result.customer.stage).toBe("interested");
  });
});

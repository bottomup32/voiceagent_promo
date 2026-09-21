import { describe, expect, it } from "vitest";
import {
  PLANS,
  callsFor,
  cheapestPlan,
  formatDollars,
  formatRate,
  monthlyCost,
} from "../lib/pricing";
import { pricingHref } from "../lib/links";

const plan = (id: string) => PLANS.find((p) => p.id === id)!;

describe("monthlyCost", () => {
  it("is the flat price up to and including the last included minute", () => {
    expect(monthlyCost(plan("solo"), 0)).toBe(99);
    expect(monthlyCost(plan("solo"), 500)).toBe(99);
    expect(monthlyCost(plan("business"), 2000)).toBe(299);
  });

  it("bills only the minutes past the allowance, at the plan's own rate", () => {
    expect(monthlyCost(plan("solo"), 600)).toBe(139);
    expect(monthlyCost(plan("standard"), 1003)).toBe(199.9);
    expect(monthlyCost(plan("business"), 2100)).toBe(324);
  });

  it("treats nonsense usage as none", () => {
    expect(monthlyCost(plan("solo"), -50)).toBe(99);
    expect(monthlyCost(plan("solo"), Number.NaN)).toBe(99);
  });
});

describe("cheapestPlan", () => {
  it("moves up a plan where the overage crosses the next price", () => {
    expect(cheapestPlan(100).id).toBe("solo");
    expect(cheapestPlan(700).id).toBe("solo");
    expect(cheapestPlan(800).id).toBe("standard");
    expect(cheapestPlan(1300).id).toBe("standard");
    expect(cheapestPlan(1400).id).toBe("business");
    expect(cheapestPlan(5000).id).toBe("business");
  });

  it("gives a tie to the plan with more headroom", () => {
    // Solo at 750 minutes is 99 + 250 × 0.40 = 199, the price of Standard.
    expect(monthlyCost(plan("solo"), 750)).toBe(199);
    expect(cheapestPlan(750).id).toBe("standard");
  });
});

describe("the price list", () => {
  it("gets cheaper per extra minute as the plans get bigger", () => {
    const rates = PLANS.map((p) => p.overagePerMinute);
    expect(rates).toEqual([...rates].sort((a, b) => b - a));
  });

  it("recommends exactly one plan", () => {
    expect(PLANS.filter((p) => p.recommended).map((p) => p.id)).toEqual(["standard"]);
  });
});

describe("formatting", () => {
  it("shows cents only when there are some", () => {
    expect(formatDollars(199)).toBe("$199");
    expect(formatDollars(199.9)).toBe("$199.90");
    expect(formatDollars(1249)).toBe("$1,249");
  });

  it("always quotes a rate to the cent", () => {
    expect(formatRate(0.3)).toBe("$0.30");
    expect(formatRate(0.25)).toBe("$0.25");
  });

  it("turns minutes into calls at two minutes a call", () => {
    expect(callsFor(500)).toBe(250);
    expect(callsFor(2000)).toBe(1000);
  });
});

describe("pricingHref", () => {
  it("sends a prospect to the pricing page that knows their demo", () => {
    expect(pricingHref("abc123")).toBe("/c/abc123/pricing");
    expect(pricingHref()).toBe("/pricing");
  });
});

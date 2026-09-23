import { describe, expect, it } from "vitest";
import { FIXTURES } from "../evals/fixtures";
import { buildPrompts, safetyLines } from "../lib/prompt";
import { emptyProfile } from "../lib/research";

/**
 * Guards against the prompt growing a rule for every call that went wrong.
 * Every line in the voice prompt is read on every turn: a longer prompt is a
 * slower first word and more rules to trade off against each other. A change
 * that needs more room should say why in the diff that raises these numbers.
 */

/** The voice prompt with no business data in it: the rules alone. */
const LIVE_TEMPLATE_MAX = 3900;
/** The backend prompt before the profile JSON. */
const BACKEND_RULES_MAX = 1200;
/** Lines that differ by kind of business. */
const SAFETY_LINES_MAX = 2;

const CATEGORIES = [
  "pizzeria", "Italian restaurant", "Coffee shop", "Dental clinic", "Veterinary hospital",
  "Barber shop", "Day spa", "Hardware store", "Plumber", "Immigration law firm",
  "Accounting firm", "Consulate", "Coworking space", "", undefined,
];

describe("prompt budget", () => {
  it("keeps the voice prompt's own rules inside the budget, in every opening language", () => {
    for (const language of ["en", "ko", "es"]) {
      const { live } = buildPrompts(emptyProfile("X"), "A", language);
      expect(live.length).toBeLessThanOrEqual(LIVE_TEMPLATE_MAX);
    }
  });

  it("keeps the backend's rules inside the budget", () => {
    const { backend } = buildPrompts(emptyProfile("X"), "A");
    expect(backend.indexOf("# Business profile")).toBeLessThanOrEqual(BACKEND_RULES_MAX);
  });

  it("changes at most two lines by kind of business", () => {
    for (const category of CATEGORIES) {
      expect(safetyLines(category).length).toBeLessThanOrEqual(SAFETY_LINES_MAX);
    }
  });
});

describe("every fixture", () => {
  for (const fixture of FIXTURES) {
    const prompts = buildPrompts(fixture.profile, fixture.agentName, fixture.language);

    it(`${fixture.id}: carries the guide's sections`, () => {
      for (const heading of [
        "# Role and objective",
        "# Backchannel policy",
        "# Interruption policy",
        "# Unclear audio",
        "# Delegation policy",
        "# Honesty and escalation",
      ]) {
        expect(`\n${prompts.live}`).toContain(`\n${heading}\n`);
      }
    });

    it(`${fixture.id}: says nothing broken or unkind`, () => {
      for (const text of [prompts.live, prompts.backend, prompts.greeting]) {
        expect(text).not.toContain("undefined");
        expect(text).not.toContain("null");
        expect(text).not.toMatch(/\n\n\n/);
        expect(text).not.toMatch(/\ba [aeiou]/i);
      }
      expect(prompts.backend).not.toContain("reviewSummary");
    });
  }
});

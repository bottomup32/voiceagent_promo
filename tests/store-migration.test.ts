import { describe, expect, it } from "vitest";
import { normalize } from "../lib/store";
import { PROMPT_VERSION, buildPrompts } from "../lib/prompt";
import { DEFAULT_VOICE } from "../lib/types";
import type { BusinessProfile, Customer } from "../lib/types";

const profile: BusinessProfile = {
  name: "Joe's Pizza",
  category: "pizzeria",
  address: "7 Carmine St, New York, NY 10014",
  hours: [{ day: "Monday", open: "10:00", close: "22:00", closed: false }],
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

describe("prompts saved before the current wording", () => {
  it("rebuilds a generated prompt so a saved customer speaks the caller's language", () => {
    const old = record({
      prompts: {
        live: "You are Alex. Speak American English in a standard US accent.",
        backend: "Answer from the profile.",
        greeting: "Greet the caller now, then pause and listen.",
        edited: false,
        // Written before prompts were versioned.
      },
    });

    const fixed = normalize(old);

    expect(fixed.prompts.version).toBe(PROMPT_VERSION);
    expect(fixed.prompts.live).toContain("switch to that language");
    expect(fixed.prompts.greeting).toContain("Speak first.");
  });

  it("leaves a prompt somebody wrote by hand exactly as it was", () => {
    const written = {
      live: "Be brief. Never mention the weather.",
      backend: "Answer from the profile.",
      greeting: "Just say hello.",
      edited: true,
    };

    expect(normalize(record({ prompts: written })).prompts).toEqual(written);
  });

  it("does not rewrite a prompt that is already current", () => {
    const current = record();
    expect(normalize(current).prompts).toEqual(current.prompts);
  });

  it("still moves a record off the retired Australian default voice", () => {
    expect(normalize(record({ voice: "quartz" })).voice).toBe(DEFAULT_VOICE);
  });
});

describe("records written before the funnel had phases", () => {
  it("reads a lost deal as churned", () => {
    expect(normalize(record({ stage: "lost" })).phase).toBe("churned");
  });

  it("keeps everyone else in the demo, a won deal included", () => {
    expect(normalize(record({ stage: "won" })).phase).toBe("demo");
    expect(normalize(record({ stage: undefined })).phase).toBe("demo");
  });

  it("leaves a phase that was set alone", () => {
    expect(normalize(record({ stage: "won", phase: "onboarding" })).phase).toBe("onboarding");
  });
});

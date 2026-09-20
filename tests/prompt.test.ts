import { describe, expect, it } from "vitest";
import { buildPrompts, resolvePrompts } from "../lib/prompt";
import type { BusinessProfile } from "../lib/types";

const profile: BusinessProfile = {
  name: "Joe's Pizza",
  category: "pizzeria",
  address: "7 Carmine St, New York, NY 10014",
  phone: "(212) 366-1182",
  hours: [
    { day: "Monday", open: "10:00", close: "05:00" },
    { day: "Sunday", open: "", close: "", closed: true },
  ],
  services: [{ name: "Cheese slice", price: "$3.75" }],
  highlights: ["Classic New York slice"],
  policies: { reservations: "No reservations", parking: "Street parking" },
  faqs: [{ q: "Do you deliver?", a: "Through delivery apps." }],
};

describe("buildPrompts", () => {
  const prompts = buildPrompts(profile, "Alex");

  it("keeps the blank lines that separate sections", () => {
    expect(prompts.live).toContain("\n\nHow to speak:");
    expect(prompts.live).toContain("\n\nWhat you know without checking:");
  });

  it("puts the agent, business, and city in the first line", () => {
    expect(prompts.live.split("\n")[0]).toBe(
      "You are Alex, the phone receptionist at Joe's Pizza, a pizzeria in New York.",
    );
  });

  it("states hours, services, and policies as facts the voice layer owns", () => {
    expect(prompts.live).toContain("Monday: 10:00-05:00");
    expect(prompts.live).toContain("Sunday: closed");
    expect(prompts.live).toContain("Cheese slice ($3.75)");
    expect(prompts.live).toContain("Reservations: No reservations");
  });

  it("omits an unknown phone line instead of leaving a blank", () => {
    const withoutPhone = buildPrompts({ ...profile, phone: undefined }, "Alex");
    expect(withoutPhone.live).not.toContain("- Phone:");
    expect(withoutPhone.live).not.toMatch(/\n\n\n/);
  });

  it("gives the backend the whole profile as JSON", () => {
    expect(prompts.backend).toContain('"name": "Joe\'s Pizza"');
    expect(prompts.backend).toContain("Do you deliver?");
  });

  it("pins the accent and the energy so the voice does not drift", () => {
    expect(prompts.live).toContain("standard US accent");
    expect(prompts.live).toContain("upbeat");
    expect(prompts.greeting).toContain("standard American accent");
  });

  it("names the business and the agent in the greeting", () => {
    expect(prompts.greeting).toContain("Thanks for calling Joe's Pizza, this is Alex!");
  });

  it("starts unedited", () => {
    expect(prompts.edited).toBe(false);
  });
});

describe("resolvePrompts", () => {
  const cafe: BusinessProfile = {
    name: "Blue Bottle",
    category: "Coffee shop",
    address: "1 Main St",
    hours: [],
    services: [],
    highlights: [],
    policies: {},
    faqs: [],
  };

  it("keeps generated prompts in step with the data when nobody has edited them", () => {
    const current = buildPrompts(cafe, "Alex");
    // The editor posts the prompts back untouched alongside a new agent name.
    const next = resolvePrompts({
      current,
      submitted: current,
      profile: cafe,
      agentName: "Sam",
    });
    expect(next.edited).toBe(false);
    expect(next.greeting).toContain("this is Sam!");
  });

  it("does not mark prompts edited when a save carries them back unchanged", () => {
    const current = buildPrompts(cafe, "Alex");
    const next = resolvePrompts({
      current,
      submitted: current,
      profile: cafe,
      agentName: "Alex",
    });
    expect(next.edited).toBe(false);
  });

  it("marks prompts edited once the text actually differs", () => {
    const current = buildPrompts(cafe, "Alex");
    const next = resolvePrompts({
      current,
      submitted: { ...current, greeting: "Say hi." },
      profile: cafe,
      agentName: "Alex",
    });
    expect(next.edited).toBe(true);
    expect(next.greeting).toBe("Say hi.");
  });

  it("leaves hand-written prompts alone when the data changes", () => {
    const current = { ...buildPrompts(cafe, "Alex"), edited: true };
    const next = resolvePrompts({
      current,
      submitted: current,
      profile: { ...cafe, address: "2 Main St" },
      agentName: "Sam",
    });
    expect(next).toEqual(current);
  });

  it("rebuilds hand-written prompts when asked to", () => {
    const current = { ...buildPrompts(cafe, "Alex"), edited: true };
    const next = resolvePrompts({
      current,
      submitted: current,
      profile: cafe,
      agentName: "Sam",
      regenerate: true,
    });
    expect(next.edited).toBe(false);
    expect(next.greeting).toContain("this is Sam!");
  });
});

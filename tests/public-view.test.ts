import { describe, expect, it } from "vitest";
import type { Customer } from "../lib/types";
import { DEFAULT_CALL_SOUND, DEFAULT_DEMO_MINUTES } from "../lib/types";
import { demoAllowance } from "../lib/analytics";
import { customerLink } from "../lib/share";
import { mailtoFor } from "../lib/links";

/**
 * The demo page is public, so it must carry the business's own data and
 * nothing the operator keeps about the business. This mirrors the prop set
 * the page builds in app/c/[id]/page.tsx.
 */
function publicProps(customer: Customer) {
  return {
    customerId: customer.id,
    name: customer.profile.name,
    category: customer.profile.category,
    address: customer.profile.address,
    phone: customer.profile.phone,
    agentName: customer.agentName,
    callSound: customer.callSound ?? DEFAULT_CALL_SOUND,
    profile: customer.profile,
    prompts: {
      live: customer.prompts.live,
      backend: customer.prompts.backend,
      greeting: customer.prompts.greeting,
    },
    dossier: customer.dossier,
    sources: customer.sources,
    researchedAt: customer.researchedAt,
    demo: demoAllowance([], customer.demoMinutes ?? DEFAULT_DEMO_MINUTES),
    demoUrl: customerLink(customer.id),
  };
}

/**
 * The scenarios page at /c/[id]/scenarios is public too, and it asks for less
 * than the demo page: no call state, no research, no prompts. This mirrors
 * what app/c/[id]/scenarios/page.tsx reads off the customer.
 */
function scenarioProps(customer: Customer) {
  return {
    name: customer.profile.name,
    category: customer.profile.category,
    agentName: customer.agentName,
    mailto: mailtoFor(customer.profile.name, customerLink(customer.id)),
  };
}

const customer: Customer = {
  id: "abc123456789",
  label: "warm lead",
  contactName: "Office manager",
  contactEmail: "private@example.com",
  notes: "internal note: pricing sensitive",
  active: true,
  businessName: "Factoria Family Dentistry",
  websiteUrl: "https://example.com",
  mapsUrl: "https://maps.app.goo.gl/x",
  researchNotes: "the Bellevue branch only",
  profile: {
    name: "Factoria Family Dentistry",
    category: "Dentist",
    address: "4100 Factoria Blvd SE, Bellevue, WA",
    hours: [],
    services: [],
    highlights: [],
    policies: {},
    faqs: [],
  },
  dossier: "# Briefing",
  sources: [{ url: "https://example.com", title: "example.com" }],
  prompts: { live: "live", backend: "backend", greeting: "greeting", edited: false },
  voice: "gleam",
  callSound: DEFAULT_CALL_SOUND,
  agentName: "Alex",
  status: "ready",
  createdAt: "2026-09-19T00:00:00.000Z",
  updatedAt: "2026-09-19T00:00:00.000Z",
};

describe("public demo props", () => {
  const props = publicProps(customer);
  const serialized = JSON.stringify(props);

  it("carries what the business should see", () => {
    expect(props.name).toBe("Factoria Family Dentistry");
    expect(props.prompts.live).toBe("live");
    expect(props.dossier).toBe("# Briefing");
    expect(props.sources).toHaveLength(1);
  });

  it("leaves out the operator's own notes about the business", () => {
    for (const secret of [
      customer.contactEmail!,
      customer.contactName!,
      customer.notes!,
      customer.label!,
      customer.researchNotes!,
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("carries no field the page did not ask for", () => {
    expect(Object.keys(props).sort()).toEqual(
      [
        "address",
        "agentName",
        "callSound",
        "category",
        "customerId",
        "demo",
        "demoUrl",
        "dossier",
        "name",
        "phone",
        "profile",
        "prompts",
        "researchedAt",
        "sources",
      ].sort(),
    );
  });

  it("does not expose the prompts' edited flag, which is an operator detail", () => {
    expect(props.prompts).not.toHaveProperty("edited");
  });
});

describe("public scenarios props", () => {
  const props = scenarioProps(customer);
  const serialized = JSON.stringify(props);

  it("carries the business and its receptionist", () => {
    expect(props.name).toBe("Factoria Family Dentistry");
    expect(props.agentName).toBe("Alex");
    expect(props.mailto).toContain(encodeURIComponent(customer.id));
  });

  it("leaves out the operator's own notes about the business", () => {
    for (const secret of [
      customer.contactEmail!,
      customer.contactName!,
      customer.notes!,
      customer.label!,
      customer.researchNotes!,
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("carries no field the page did not ask for", () => {
    expect(Object.keys(props).sort()).toEqual(
      ["agentName", "category", "mailto", "name"].sort(),
    );
  });
});

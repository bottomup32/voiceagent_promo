import { createResponse } from "./openai";
import { fallbackName, parseMapsUrl, resolveMapsUrl } from "./maps";
import type { BusinessProfile, ResearchSource } from "./types";

const PROFILE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "name",
    "category",
    "address",
    "phone",
    "website",
    "hours",
    "services",
    "highlights",
    "policies",
    "faqs",
    "rating",
    "reviewSummary",
  ],
  properties: {
    name: { type: "string" },
    category: { type: "string" },
    address: { type: "string" },
    phone: { type: ["string", "null"] },
    website: { type: ["string", "null"] },
    hours: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["day", "open", "close", "closed"],
        properties: {
          day: { type: "string" },
          open: { type: "string" },
          close: { type: "string" },
          closed: { type: "boolean" },
        },
      },
    },
    services: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "price", "description"],
        properties: {
          name: { type: "string" },
          price: { type: ["string", "null"] },
          description: { type: ["string", "null"] },
        },
      },
    },
    highlights: { type: "array", items: { type: "string" } },
    policies: {
      type: "object",
      additionalProperties: false,
      required: [
        "reservations",
        "walkIns",
        "parking",
        "payment",
        "cancellation",
        "other",
      ],
      properties: {
        reservations: { type: ["string", "null"] },
        walkIns: { type: ["string", "null"] },
        parking: { type: ["string", "null"] },
        payment: { type: ["string", "null"] },
        cancellation: { type: ["string", "null"] },
        other: { type: "array", items: { type: "string" } },
      },
    },
    faqs: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["q", "a"],
        properties: { q: { type: "string" }, a: { type: "string" } },
      },
    },
    rating: { type: ["number", "null"] },
    reviewSummary: { type: ["string", "null"] },
  },
} as const;

export type ResearchResult = {
  resolvedUrl: string;
  profile: BusinessProfile;
  dossier: string;
  sources: ResearchSource[];
};

function researchModel(): string {
  return process.env.RESEARCH_MODEL || "gpt-5.6-terra";
}

function stripNulls<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripNulls(item)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (item === null || item === "" || item === "unknown") continue;
      out[key] = stripNulls(item);
    }
    return out as T;
  }
  return value;
}

/** Step 1: web search for everything a receptionist would need to answer. */
export async function gatherDossier(
  resolvedUrl: string,
  nameHint: string,
): Promise<{ dossier: string; sources: ResearchSource[] }> {
  const result = await createResponse({
    model: researchModel(),
    tools: [{ type: "web_search", search_context_size: "medium" }],
    instructions:
      "You are a researcher preparing a briefing for a phone receptionist. Use web search. Report only what you can find in sources, cite them, and write 'unknown' where the answer is not available. Never invent hours, prices, or phone numbers.",
    input: [
      `Research this business so an AI phone receptionist can answer calls for it.`,
      `Google Maps link: ${resolvedUrl}`,
      nameHint ? `Likely name: ${nameHint}` : "",
      "",
      "Cover, as markdown sections:",
      "1. Identity: exact business name, category, full address, phone number, website.",
      "2. Opening hours for every day of the week.",
      "3. Services or menu with prices where published, plus the items it is best known for.",
      "4. Policies: reservations, walk-ins, parking, payment methods, cancellation.",
      "5. The questions callers most often ask this kind of business, with the answer for this one.",
      "6. Rating and the recurring themes in recent reviews.",
      "",
      "Mark anything you cannot verify as unknown.",
    ]
      .filter(Boolean)
      .join("\n"),
  });

  return { dossier: result.text, sources: result.citations };
}

/** Step 2: turn the dossier into the structured profile the agent runs on. */
export async function structureProfile(
  dossier: string,
  nameHint: string,
): Promise<BusinessProfile> {
  const result = await createResponse({
    model: researchModel(),
    instructions:
      "Convert the research briefing into structured data. Copy facts only from the briefing. Use null or an empty array where the briefing says unknown. Do not add facts.",
    input: [
      nameHint ? `Business name hint: ${nameHint}` : "",
      "Research briefing:",
      dossier,
    ]
      .filter(Boolean)
      .join("\n\n"),
    text: {
      format: {
        type: "json_schema",
        name: "business_profile",
        strict: true,
        schema: PROFILE_SCHEMA,
      },
    },
  });

  const parsed = JSON.parse(result.text) as BusinessProfile;
  const profile = stripNulls(parsed);
  return {
    ...profile,
    name: profile.name || nameHint || "Unknown business",
    hours: profile.hours ?? [],
    services: profile.services ?? [],
    highlights: profile.highlights ?? [],
    policies: profile.policies ?? {},
    faqs: profile.faqs ?? [],
  };
}

export async function researchBusiness(mapsUrl: string): Promise<ResearchResult> {
  const resolvedUrl = await resolveMapsUrl(mapsUrl);
  const parsed = parseMapsUrl(resolvedUrl);
  const nameHint = fallbackName(parsed, resolvedUrl);

  const { dossier, sources } = await gatherDossier(resolvedUrl, parsed.nameHint ?? "");
  const profile = await structureProfile(dossier, nameHint);

  if (parsed.lat !== undefined) profile.lat = parsed.lat;
  if (parsed.lng !== undefined) profile.lng = parsed.lng;

  return { resolvedUrl, profile, dossier, sources };
}

export function emptyProfile(name: string): BusinessProfile {
  return {
    name,
    category: "",
    address: "",
    hours: [],
    services: [],
    highlights: [],
    policies: {},
    faqs: [],
  };
}

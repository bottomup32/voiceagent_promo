import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getCustomer, listCustomers, saveCustomer } from "@/lib/store";
import { listAllCalls, readEvents } from "@/lib/calls";
import { emptyStats, statsByCustomer } from "@/lib/analytics";
import { isMapsUrl } from "@/lib/maps";
import { emptyProfile, researchBusiness } from "@/lib/research";
import { buildPrompts } from "@/lib/prompt";
import type { Customer, CustomerWithStats, ResearchInputs } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  const [customers, calls, events] = await Promise.all([
    listCustomers(),
    listAllCalls(),
    readEvents(),
  ]);
  const stats = statsByCustomer(calls, events);
  const withStats: CustomerWithStats[] = customers.map((customer) => ({
    ...customer,
    stats: stats[customer.id] ?? emptyStats(),
  }));
  return NextResponse.json({ customers: withStats });
}

export async function POST(request: Request) {
  let body: {
    businessName?: string;
    websiteUrl?: string;
    mapsUrl?: string;
    researchNotes?: string;
    label?: string;
    contactName?: string;
    contactEmail?: string;
    agentName?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const businessName = (body.businessName ?? "").trim();
  if (!businessName) {
    return NextResponse.json(
      { error: "Enter the business name." },
      { status: 400 },
    );
  }

  const websiteUrl = (body.websiteUrl ?? "").trim() || undefined;
  if (websiteUrl && !/^https?:\/\//i.test(websiteUrl)) {
    return NextResponse.json(
      { error: "The website must start with http:// or https://." },
      { status: 400 },
    );
  }

  const mapsUrl = (body.mapsUrl ?? "").trim() || undefined;
  if (mapsUrl && !isMapsUrl(mapsUrl)) {
    return NextResponse.json(
      { error: "That does not look like a Google Maps link." },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const agentName = (body.agentName ?? "Alex").trim() || "Alex";
  const profile = emptyProfile(businessName);

  const customer: Customer = {
    id: nanoid(12),
    label: body.label?.trim() || undefined,
    contactName: body.contactName?.trim() || undefined,
    contactEmail: body.contactEmail?.trim() || undefined,
    active: true,
    businessName,
    websiteUrl,
    mapsUrl,
    researchNotes: body.researchNotes?.trim() || undefined,
    profile,
    dossier: "",
    sources: [],
    prompts: buildPrompts(profile, agentName),
    voice: process.env.LIVE_VOICE || "quartz",
    agentName,
    status: "researching",
    createdAt: now,
    updatedAt: now,
  };

  await saveCustomer(customer);

  // Research runs after the response so the table can show "Researching".
  void runResearch(customer.id, {
    businessName,
    websiteUrl,
    mapsUrl,
    notes: customer.researchNotes,
  });

  return NextResponse.json({ customer }, { status: 201 });
}

async function runResearch(id: string, inputs: ResearchInputs) {
  try {
    const result = await researchBusiness(inputs);
    const current = await getCustomer(id);
    if (!current) return;
    await saveCustomer({
      ...current,
      businessName: result.businessName || current.businessName,
      resolvedMapsUrl: result.resolvedMapsUrl,
      profile: result.profile,
      dossier: result.dossier,
      sources: result.sources,
      prompts: current.prompts.edited
        ? current.prompts
        : buildPrompts(result.profile, current.agentName),
      status: "ready",
      error: undefined,
      researchedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const current = await getCustomer(id);
    if (!current) return;
    await saveCustomer({
      ...current,
      status: "error",
      error: error instanceof Error ? error.message : String(error),
      updatedAt: new Date().toISOString(),
    });
  }
}

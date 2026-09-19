import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { listCustomers, saveCustomer } from "@/lib/store";
import { listAllCalls, readEvents } from "@/lib/calls";
import { emptyStats, statsByCustomer } from "@/lib/analytics";
import { fallbackName, isMapsUrl, parseMapsUrl } from "@/lib/maps";
import { emptyProfile, researchBusiness } from "@/lib/research";
import { buildPrompts } from "@/lib/prompt";
import type { Customer, CustomerWithStats } from "@/lib/types";

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
    mapsUrl?: string;
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

  const mapsUrl = (body.mapsUrl ?? "").trim();
  if (!mapsUrl || !isMapsUrl(mapsUrl)) {
    return NextResponse.json(
      { error: "Enter a Google Maps link for the business." },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const agentName = (body.agentName ?? "Alex").trim() || "Alex";
  const placeholderName = fallbackName(parseMapsUrl(mapsUrl), mapsUrl);
  const profile = emptyProfile(placeholderName);

  const customer: Customer = {
    id: nanoid(12),
    label: body.label?.trim() || undefined,
    contactName: body.contactName?.trim() || undefined,
    contactEmail: body.contactEmail?.trim() || undefined,
    active: true,
    mapsUrl,
    resolvedUrl: mapsUrl,
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
  void runResearch(customer.id, mapsUrl, agentName);

  return NextResponse.json({ customer }, { status: 201 });
}

async function runResearch(id: string, mapsUrl: string, agentName: string) {
  const { getCustomer } = await import("@/lib/store");
  try {
    const result = await researchBusiness(mapsUrl);
    const current = await getCustomer(id);
    if (!current) return;
    await saveCustomer({
      ...current,
      resolvedUrl: result.resolvedUrl,
      profile: result.profile,
      dossier: result.dossier,
      sources: result.sources,
      prompts: current.prompts.edited
        ? current.prompts
        : buildPrompts(result.profile, current.agentName || agentName),
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

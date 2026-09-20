import { NextResponse } from "next/server";
import { getCustomer, saveCustomer } from "@/lib/store";
import { researchBusiness } from "@/lib/research";
import { buildPrompts } from "@/lib/prompt";

export const runtime = "nodejs";
export const maxDuration = 600;

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const customer = await getCustomer(id);
  if (!customer) {
    return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  }

  let regeneratePrompts = false;
  let businessName = customer.businessName;
  let websiteUrl = customer.websiteUrl;
  let mapsUrl = customer.mapsUrl;
  let researchNotes = customer.researchNotes;

  try {
    const body = (await request.json()) as {
      regeneratePrompts?: boolean;
      businessName?: string;
      websiteUrl?: string;
      mapsUrl?: string;
      researchNotes?: string;
    };
    regeneratePrompts = body.regeneratePrompts ?? false;
    if (body.businessName?.trim()) businessName = body.businessName.trim();
    if (body.websiteUrl !== undefined) websiteUrl = body.websiteUrl.trim() || undefined;
    if (body.mapsUrl !== undefined) mapsUrl = body.mapsUrl.trim() || undefined;
    if (body.researchNotes !== undefined) {
      researchNotes = body.researchNotes.trim() || undefined;
    }
  } catch {
    // No body is fine: re-research with what is stored.
  }

  if (!businessName) {
    return NextResponse.json({ error: "Enter the business name." }, { status: 400 });
  }

  await saveCustomer({
    ...customer,
    businessName,
    websiteUrl,
    mapsUrl,
    researchNotes,
    status: "researching",
    error: undefined,
  });

  try {
    const result = await researchBusiness({
      businessName,
      websiteUrl,
      mapsUrl,
      notes: researchNotes,
    });
    const keepPrompts = customer.prompts.edited && !regeneratePrompts;
    const next = {
      ...customer,
      businessName: result.businessName || businessName,
      websiteUrl,
      mapsUrl,
      researchNotes,
      resolvedMapsUrl: result.resolvedMapsUrl,
      profile: result.profile,
      dossier: result.dossier,
      sources: result.sources,
      prompts: keepPrompts
        ? customer.prompts
        : buildPrompts(result.profile, customer.agentName),
      status: "ready" as const,
      error: undefined,
      researchedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await saveCustomer(next);
    return NextResponse.json({ customer: next });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await saveCustomer({
      ...customer,
      businessName,
      websiteUrl,
      mapsUrl,
      researchNotes,
      status: "error",
      error: message,
      updatedAt: new Date().toISOString(),
    });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

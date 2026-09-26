import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { getCustomer, saveCustomer } from "@/lib/store";
import { researchBusiness } from "@/lib/research";
import { buildPrompts } from "@/lib/prompt";

export const runtime = "nodejs";
// Research is two model calls and runs over a minute. 300s is the ceiling on
// every Vercel plan with fluid compute, Hobby included, and fluid compute is on
// by default. A project with it turned off falls back to the old 60s and will
// cut this short.
export const maxDuration = 300;

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

  try {
    await saveCustomer({
      ...customer,
      businessName,
      websiteUrl,
      mapsUrl,
      researchNotes,
      status: "researching",
      error: undefined,
    });
  } catch (error) {
    return jsonError(error);
  }

  try {
    const result = await researchBusiness({
      businessName,
      websiteUrl,
      mapsUrl,
      notes: researchNotes,
    });
    // Research takes a minute or two; re-read rather than build off the record
    // from the top of the request, so a phase/stage/code change made while it
    // ran is not clobbered by writing back a stale copy.
    const current = await getCustomer(id);
    if (!current) {
      return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    }
    const keepPrompts = current.prompts.edited && !regeneratePrompts;
    const next = {
      ...current,
      businessName: result.businessName || businessName,
      websiteUrl,
      mapsUrl,
      researchNotes,
      resolvedMapsUrl: result.resolvedMapsUrl,
      profile: result.profile,
      dossier: result.dossier,
      sources: result.sources,
      prompts: keepPrompts
        ? current.prompts
        : buildPrompts(result.profile, current.agentName, current.language),
      status: "ready" as const,
      error: undefined,
      researchedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await saveCustomer(next);
    return NextResponse.json({ customer: next });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const current = await getCustomer(id);
    if (!current) {
      return NextResponse.json({ error: message }, { status: 502 });
    }
    await saveCustomer({
      ...current,
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

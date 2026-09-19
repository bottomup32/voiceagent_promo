import { NextResponse } from "next/server";
import { getCustomer, saveCustomer } from "@/lib/store";
import { researchBusiness } from "@/lib/research";
import { buildPrompts } from "@/lib/prompt";
import { OpenAIError } from "@/lib/openai";

export const runtime = "nodejs";
export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const customer = await getCustomer(id);
  if (!customer) {
    return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  }

  let regeneratePrompts = false;
  let mapsUrl = customer.mapsUrl;
  try {
    const body = (await request.json()) as {
      regeneratePrompts?: boolean;
      mapsUrl?: string;
    };
    regeneratePrompts = body.regeneratePrompts ?? false;
    if (body.mapsUrl?.trim()) mapsUrl = body.mapsUrl.trim();
  } catch {
    // No body is fine: re-research with the stored link.
  }

  await saveCustomer({ ...customer, status: "researching", error: undefined });

  try {
    const result = await researchBusiness(mapsUrl);
    const keepPrompts = customer.prompts.edited && !regeneratePrompts;
    const next = {
      ...customer,
      mapsUrl,
      resolvedUrl: result.resolvedUrl,
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
      status: "error",
      error: message,
      updatedAt: new Date().toISOString(),
    });
    const status = error instanceof OpenAIError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

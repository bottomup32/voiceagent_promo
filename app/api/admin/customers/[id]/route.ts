import { NextResponse } from "next/server";
import { deleteCustomer, getCustomer, saveCustomer } from "@/lib/store";
import { listCalls, readEvents } from "@/lib/calls";
import { computeStats } from "@/lib/analytics";
import { buildPrompts } from "@/lib/prompt";
import type { BusinessProfile, Customer, CustomerPrompts } from "@/lib/types";
import { LIVE_VOICES } from "@/lib/types";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const customer = await getCustomer(id);
  if (!customer) {
    return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  }
  const [calls, events] = await Promise.all([listCalls(id), readEvents()]);
  const stats = computeStats(
    calls,
    events.filter((event) => event.customerId === id),
  );
  return NextResponse.json({ customer, stats, calls });
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const customer = await getCustomer(id);
  if (!customer) {
    return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  }

  let body: Partial<{
    label: string;
    contactName: string;
    contactEmail: string;
    notes: string;
    active: boolean;
    agentName: string;
    voice: string;
    profile: BusinessProfile;
    prompts: Partial<CustomerPrompts>;
    regeneratePrompts: boolean;
  }>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (body.voice && !LIVE_VOICES.includes(body.voice as (typeof LIVE_VOICES)[number])) {
    return NextResponse.json({ error: "Unknown voice." }, { status: 400 });
  }

  const next: Customer = {
    ...customer,
    label: body.label !== undefined ? body.label.trim() || undefined : customer.label,
    contactName:
      body.contactName !== undefined
        ? body.contactName.trim() || undefined
        : customer.contactName,
    contactEmail:
      body.contactEmail !== undefined
        ? body.contactEmail.trim() || undefined
        : customer.contactEmail,
    notes: body.notes !== undefined ? body.notes.trim() || undefined : customer.notes,
    active: body.active ?? customer.active,
    agentName: body.agentName?.trim() || customer.agentName,
    voice: body.voice ?? customer.voice,
    profile: body.profile ?? customer.profile,
    updatedAt: new Date().toISOString(),
  };

  if (body.regeneratePrompts) {
    next.prompts = buildPrompts(next.profile, next.agentName);
  } else if (body.prompts) {
    next.prompts = {
      live: body.prompts.live ?? customer.prompts.live,
      backend: body.prompts.backend ?? customer.prompts.backend,
      greeting: body.prompts.greeting ?? customer.prompts.greeting,
      edited: true,
    };
  }

  await saveCustomer(next);
  return NextResponse.json({ customer: next });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const removed = await deleteCustomer(id);
  if (!removed) {
    return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

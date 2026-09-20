import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { assertWritableStore } from "@/lib/kv";
import { deleteCustomer, getCustomer, saveCustomer } from "@/lib/store";
import { listCalls, readEvents } from "@/lib/calls";
import { computeStats } from "@/lib/analytics";
import { resolvePrompts } from "@/lib/prompt";
import type { BusinessProfile, CallSound, Customer, CustomerPrompts } from "@/lib/types";
import { LIVE_VOICES } from "@/lib/types";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  let customer, calls, events;
  try {
    customer = await getCustomer(id);
    if (!customer) {
      return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    }
    [calls, events] = await Promise.all([listCalls(id), readEvents()]);
  } catch (error) {
    return jsonError(error);
  }
  const stats = computeStats(
    calls,
    events.filter((event) => event.customerId === id),
  );
  return NextResponse.json({ customer, stats, calls });
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  let customer;
  try {
    customer = await getCustomer(id);
  } catch (error) {
    return jsonError(error);
  }
  if (!customer) {
    return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  }

  let body: Partial<{
    businessName: string;
    websiteUrl: string;
    mapsUrl: string;
    researchNotes: string;
    label: string;
    contactName: string;
    contactEmail: string;
    notes: string;
    active: boolean;
    agentName: string;
    demoMinutes: number;
    voice: string;
    callSound: CallSound;
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
    businessName: body.businessName?.trim() || customer.businessName,
    websiteUrl:
      body.websiteUrl !== undefined
        ? body.websiteUrl.trim() || undefined
        : customer.websiteUrl,
    mapsUrl:
      body.mapsUrl !== undefined ? body.mapsUrl.trim() || undefined : customer.mapsUrl,
    researchNotes:
      body.researchNotes !== undefined
        ? body.researchNotes.trim() || undefined
        : customer.researchNotes,
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
    demoMinutes:
      typeof body.demoMinutes === "number" && Number.isFinite(body.demoMinutes)
        ? Math.max(0, Math.round(body.demoMinutes))
        : customer.demoMinutes,
    voice: body.voice ?? customer.voice,
    callSound: body.callSound ?? customer.callSound,
    profile: body.profile ?? customer.profile,
    updatedAt: new Date().toISOString(),
  };

  next.prompts = resolvePrompts({
    current: customer.prompts,
    submitted: body.prompts,
    profile: next.profile,
    agentName: next.agentName,
    regenerate: body.regeneratePrompts,
  });

  try {
    assertWritableStore();
    await saveCustomer(next);
  } catch (error) {
    return jsonError(error);
  }
  return NextResponse.json({ customer: next });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  let removed = false;
  try {
    removed = await deleteCustomer(id);
  } catch (error) {
    return jsonError(error);
  }
  if (!removed) {
    return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { assertWritableStore } from "@/lib/kv";
import { deleteCustomer, getCustomer, saveCustomer } from "@/lib/store";
import { listCalls, readEvents } from "@/lib/calls";
import { computeStats, extendDemoMinutes } from "@/lib/analytics";
import { listNotes } from "@/lib/crm";
import { resolvePrompts } from "@/lib/prompt";
import { languageOf } from "@/lib/languages";
import type {
  BusinessProfile,
  CallSound,
  Customer,
  CustomerPrompts,
  CustomerStage,
} from "@/lib/types";
import { CUSTOMER_STAGES, DEFAULT_DEMO_MINUTES, LIVE_VOICES } from "@/lib/types";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  let customer, calls, events, notes;
  try {
    customer = await getCustomer(id);
    if (!customer) {
      return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    }
    // Only this customer's views; no need to read every other one's.
    [calls, events, notes] = await Promise.all([
      listCalls(id),
      readEvents(id),
      listNotes(id),
    ]);
  } catch (error) {
    return jsonError(error);
  }
  const stats = computeStats(
    calls,
    events.filter((event) => event.customerId === id),
  );
  return NextResponse.json({ customer, stats, calls, events, notes });
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
    addDemoMinutes: number;
    stage: CustomerStage;
    lastContactedAt: string | null;
    followUpAt: string | null;
    voice: string;
    language: string;
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
  if (body.stage && !CUSTOMER_STAGES.includes(body.stage)) {
    return NextResponse.json({ error: "Unknown stage." }, { status: 400 });
  }

  if (
    body.addDemoMinutes !== undefined &&
    extendDemoMinutes(customer.demoMinutes, body.addDemoMinutes, DEFAULT_DEMO_MINUTES) === null
  ) {
    return NextResponse.json({ error: "Minutes to add must be positive." }, { status: 400 });
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
    // addDemoMinutes is the "Add time" menu and adds to what is stored; a
    // plain demoMinutes is the Share tab's number field and sets it outright.
    demoMinutes:
      body.addDemoMinutes !== undefined
        ? extendDemoMinutes(customer.demoMinutes, body.addDemoMinutes, DEFAULT_DEMO_MINUTES)!
        : typeof body.demoMinutes === "number" && Number.isFinite(body.demoMinutes)
          ? Math.max(0, Math.round(body.demoMinutes))
          : customer.demoMinutes,
    voice: body.voice ?? customer.voice,
    // An unrecognised code lands on English rather than leaving the receptionist
    // opening in a language nothing here knows how to greet in.
    language:
      body.language !== undefined ? languageOf(body.language).code : customer.language,
    stage: body.stage ?? customer.stage,
    // null clears a date the operator set by mistake; undefined leaves it.
    lastContactedAt:
      body.lastContactedAt !== undefined
        ? body.lastContactedAt || undefined
        : customer.lastContactedAt,
    followUpAt:
      body.followUpAt !== undefined
        ? body.followUpAt || undefined
        : customer.followUpAt,
    callSound: body.callSound ?? customer.callSound,
    profile: body.profile ?? customer.profile,
    updatedAt: new Date().toISOString(),
  };

  next.prompts = resolvePrompts({
    current: customer.prompts,
    submitted: body.prompts,
    profile: next.profile,
    agentName: next.agentName,
    language: next.language,
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

import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { jsonError } from "@/lib/api";
import { assertWritableStore } from "@/lib/kv";
import { applyTransition } from "@/lib/lifecycle";
import { recordLifecycle } from "@/lib/lifecycle-store";
import { getCustomer, saveCustomer } from "@/lib/store";
import { CUSTOMER_PHASES, type CustomerPhase } from "@/lib/types";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * The only way a customer changes phase. The rules live in lib/lifecycle.ts;
 * this route loads, asks, saves and records. Preflight does not exist until
 * M5, so production stays out of reach until then.
 */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  let body: { to?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!body.to || !CUSTOMER_PHASES.includes(body.to as CustomerPhase)) {
    return NextResponse.json({ error: "Unknown phase." }, { status: 400 });
  }

  try {
    const customer = await getCustomer(id);
    if (!customer) {
      return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    }
    const moved = applyTransition(
      customer,
      body.to as CustomerPhase,
      { now: new Date().toISOString(), newId: () => nanoid(10), preflightOk: false },
      "operator",
      body.reason?.trim().slice(0, 500) || undefined,
    );
    if (!moved.ok) {
      return NextResponse.json(
        { error: moved.reasons.join(" "), reasons: moved.reasons },
        { status: 409 },
      );
    }
    assertWritableStore();
    await saveCustomer(moved.customer);
    await recordLifecycle(id, moved.events);
    return NextResponse.json({ customer: moved.customer, events: moved.events });
  } catch (error) {
    return jsonError(error);
  }
}

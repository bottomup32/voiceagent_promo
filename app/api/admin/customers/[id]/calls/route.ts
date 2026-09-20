import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { listCalls, saveCall } from "@/lib/calls";
import { assertWritableStore } from "@/lib/kv";
import { getCustomer } from "@/lib/store";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const customer = await getCustomer(id);
  if (!customer) {
    return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  }
  try {
    return NextResponse.json({ calls: await listCalls(id) });
  } catch (error) {
    return jsonError(error);
  }
}

/**
 * Reclassify one call. Calls made before the test flag was explicit were tagged
 * from the admin cookie, so an operator trying a prospect's own link marked it
 * as a test and it disappeared from the numbers. This is how those get counted
 * again, one at a time, by the person who knows which was which.
 */
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;

  let body: { callId?: string; isTest?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!body.callId || typeof body.isTest !== "boolean") {
    return NextResponse.json(
      { error: "Send a callId and isTest." },
      { status: 400 },
    );
  }

  try {
    assertWritableStore();
    const customer = await getCustomer(id);
    if (!customer) {
      return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    }
    const call = (await listCalls(id)).find((entry) => entry.id === body.callId);
    if (!call) {
      return NextResponse.json({ error: "Call not found." }, { status: 404 });
    }
    const next = { ...call, isTest: body.isTest };
    await saveCall(next);
    return NextResponse.json({ call: next });
  } catch (error) {
    return jsonError(error);
  }
}

import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { assertWritableStore } from "@/lib/kv";
import { appendEvent } from "@/lib/calls";
import { visitorId } from "@/lib/visitor";
import { getCustomer } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { customerId?: string; event?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (body.event !== "page_view" || !body.customerId) {
    return NextResponse.json({ error: "Unsupported event." }, { status: 400 });
  }

  const customer = await getCustomer(body.customerId);
  if (!customer) {
    return NextResponse.json({ error: "Unknown customer." }, { status: 404 });
  }

  try {
    assertWritableStore();
    await appendEvent({
      type: "page_view",
      customerId: customer.id,
      at: new Date().toISOString(),
      visitorId: await visitorId(),
    });
  } catch (error) {
    return jsonError(error);
  }

  return NextResponse.json({ ok: true });
}

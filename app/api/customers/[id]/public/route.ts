import { NextResponse } from "next/server";
import { getCustomer } from "@/lib/store";
import { resolveCallSound } from "@/lib/call-audio";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const customer = await getCustomer(id);
  if (!customer || !customer.active || customer.status !== "ready") {
    return NextResponse.json({ error: "This demo isn't available." }, { status: 404 });
  }
  return NextResponse.json({
    id: customer.id,
    name: customer.profile.name,
    category: customer.profile.category,
    address: customer.profile.address,
    phone: customer.profile.phone,
    agentName: customer.agentName,
    callSound: resolveCallSound(customer.callSound),
  });
}

import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { getCustomer } from "@/lib/store";
import { listCalls } from "@/lib/calls";
import { demoAllowance } from "@/lib/analytics";
import { DEFAULT_DEMO_MINUTES } from "@/lib/types";
import { resolveCallSound } from "@/lib/call-audio";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  let customer;
  try {
    customer = await getCustomer(id);
  } catch (error) {
    return jsonError(error);
  }
  if (!customer || !customer.active || customer.status !== "ready") {
    return NextResponse.json({ error: "This demo isn't available." }, { status: 404 });
  }
  let demo;
  try {
    demo = demoAllowance(
      await listCalls(customer.id),
      customer.demoMinutes ?? DEFAULT_DEMO_MINUTES,
    );
  } catch (error) {
    return jsonError(error);
  }

  return NextResponse.json({
    id: customer.id,
    demo,
    name: customer.profile.name,
    category: customer.profile.category,
    address: customer.profile.address,
    phone: customer.profile.phone,
    agentName: customer.agentName,
    callSound: resolveCallSound(customer.callSound),
  });
}

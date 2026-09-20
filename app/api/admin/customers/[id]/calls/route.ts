import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { listCalls } from "@/lib/calls";
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

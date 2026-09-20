import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { assertWritableStore } from "@/lib/kv";
import { clearLive, findCall, saveCall } from "@/lib/calls";
import type { CallStatus, TranscriptEntry } from "@/lib/types";

export const runtime = "nodejs";

const VALID: CallStatus[] = ["completed", "failed", "abandoned"];

type Params = { params: Promise<{ callId: string }> };

export async function POST(request: Request, { params }: Params) {
  const { callId } = await params;

  let body: {
    customerId?: string;
    status?: CallStatus;
    durationSec?: number;
    endReason?: string;
    transcript?: TranscriptEntry[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  // The body is read first so the lookup can go straight to the right record
  // instead of walking every customer.
  const call = await findCall(callId, body.customerId);
  if (!call) {
    return NextResponse.json({ error: "Call not found." }, { status: 404 });
  }
  if (call.status !== "started") {
    // A beacon can land after the normal report; keep the first result.
    return NextResponse.json({ ok: true, alreadyReported: true });
  }

  const status = VALID.includes(body.status as CallStatus)
    ? (body.status as CallStatus)
    : "abandoned";
  const transcript = Array.isArray(body.transcript) ? body.transcript.slice(0, 500) : [];
  const durationSec =
    typeof body.durationSec === "number" && body.durationSec >= 0
      ? Math.round(body.durationSec)
      : undefined;

  try {
    assertWritableStore();
    await saveCall({
      ...call,
      status,
      endedAt: new Date().toISOString(),
      durationSec,
      endReason: body.endReason?.slice(0, 120),
      turns: transcript.length,
      transcript,
    });
    // The line is free again. Hand the seat back before someone waits for the
    // stale window to expire.
    await clearLive(call);
  } catch (error) {
    return jsonError(error);
  }

  return NextResponse.json({ ok: true });
}

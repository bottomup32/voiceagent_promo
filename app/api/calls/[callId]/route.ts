import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { assertWritableStore } from "@/lib/kv";
import { clearLive, findCall, saveCall } from "@/lib/calls";
import { reviewCall } from "@/lib/call-review";
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

  const ended = {
    ...call,
    status,
    endedAt: new Date().toISOString(),
    durationSec,
    endReason: body.endReason?.slice(0, 120),
    turns: transcript.length,
    transcript,
  };

  try {
    assertWritableStore();
    await saveCall(ended);
    // The line is free again. Hand the seat back before someone waits for the
    // stale window to expire.
    await clearLive(call);
  } catch (error) {
    return jsonError(error);
  }

  // Read what the call says about the product while the transcript is in hand.
  // Nobody is waiting on this response — the client reports and moves on — but
  // a serverless function stops the moment it returns, so it has to be awaited
  // here rather than left running. A failed review is saved as no review.
  const review = await reviewCall(ended);
  if (review) {
    try {
      await saveCall({ ...ended, review });
    } catch {
      // The call itself is already safely recorded; the review can be asked
      // for again from the admin.
    }
  }

  return NextResponse.json({ ok: true, reviewed: Boolean(review) });
}

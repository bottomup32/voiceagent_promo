import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { listCalls, saveCall } from "@/lib/calls";
import { reviewCall, reviewable } from "@/lib/call-review";
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
 * Change one call. Two things can change.
 *
 * `isTest` reclassifies it: calls made before the test flag was explicit were
 * tagged from the admin cookie, so an operator trying a prospect's own link
 * marked it as a test and it disappeared from the numbers. This is how those
 * get counted again, one at a time, by the person who knows which was which.
 *
 * `analyze` asks for the review that a call reported before reviews existed —
 * or one where the model was unreachable at the time — never redoing a review
 * that already exists, since it costs money and the operator has already read
 * the old wording.
 */
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;

  let body: { callId?: string; isTest?: boolean; analyze?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const wantsAnalysis = body.analyze === true;
  if (!body.callId || (typeof body.isTest !== "boolean" && !wantsAnalysis)) {
    return NextResponse.json(
      { error: "Send a callId with isTest or analyze." },
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

    let next =
      typeof body.isTest === "boolean" ? { ...call, isTest: body.isTest } : call;

    if (wantsAnalysis && !next.review) {
      if (!reviewable(next)) {
        return NextResponse.json(
          { error: "This call is too short to say anything about." },
          { status: 400 },
        );
      }
      const review = await reviewCall(next);
      if (!review) {
        return NextResponse.json(
          { error: "The review could not be read back. Try again in a moment." },
          { status: 502 },
        );
      }
      next = { ...next, review };
    }

    if (next !== call) await saveCall(next);
    return NextResponse.json({ call: next });
  } catch (error) {
    return jsonError(error);
  }
}

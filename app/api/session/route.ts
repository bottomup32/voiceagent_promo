import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { nanoid } from "nanoid";
import { getCustomer } from "@/lib/store";
import { hashIp, listCalls, saveCall } from "@/lib/calls";
import { demoAllowance } from "@/lib/analytics";
import { DEFAULT_DEMO_MINUTES } from "@/lib/types";
import { isAdminRequest } from "@/lib/auth";
import { OpenAIError, createLiveSession } from "@/lib/openai";
import type { CallLog } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60_000;
const recentByIp = new Map<string, number[]>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const hits = (recentByIp.get(key) ?? []).filter((at) => now - at < RATE_WINDOW_MS);
  hits.push(now);
  recentByIp.set(key, hits);
  return hits.length > RATE_LIMIT;
}

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "local";
}

export async function POST(request: Request) {
  let body: { customerId?: string; sdp?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { customerId, sdp } = body;
  if (!customerId || !sdp) {
    return NextResponse.json({ error: "Missing customerId or sdp." }, { status: 400 });
  }

  const ip = clientIp(request);
  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many calls in a row. Wait a minute and try again." },
      { status: 429 },
    );
  }

  let customer;
  try {
    customer = await getCustomer(customerId);
  } catch (error) {
    return jsonError(error);
  }
  if (!customer) {
    return NextResponse.json({ error: "This demo isn't available." }, { status: 404 });
  }
  if (!customer.active) {
    return NextResponse.json({ error: "This demo is paused." }, { status: 403 });
  }
  if (customer.status !== "ready") {
    return NextResponse.json(
      { error: "This demo is still being prepared." },
      { status: 409 },
    );
  }

  const isTest = await isAdminRequest();

  // The demo is a fixed amount of time per prospect. Running out is the nudge:
  // the page then offers the contact form instead of the call button. An admin
  // test call does not spend it, which is why this runs after isTest.
  if (!isTest) {
    let allowance;
    try {
      allowance = demoAllowance(
        await listCalls(customer.id),
        customer.demoMinutes ?? DEFAULT_DEMO_MINUTES,
      );
    } catch (error) {
      return jsonError(error);
    }
    if (allowance.exhausted) {
      return NextResponse.json(
        {
          error: `This demo has used its ${Math.round(
            allowance.allowedSec / 60,
          )} minutes. Ask us for more and we will open it back up.`,
          exhausted: true,
        },
        { status: 403 },
      );
    }
  }

  try {
    const session = await createLiveSession(
      {
        model: process.env.LIVE_MODEL || "gpt-live-1",
        instructions: customer.prompts.live,
        audio: { output: { voice: customer.voice } },
        delegation: {
          type: "responses",
          responses: {
            model: process.env.BACKEND_MODEL || "gpt-5.6-terra",
            instructions: customer.prompts.backend,
          },
        },
        store: false,
      },
      sdp,
    );

    const call: CallLog = {
      id: nanoid(12),
      customerId: customer.id,
      liveSessionId: session.id,
      startedAt: new Date().toISOString(),
      status: "started",
      transcript: [],
      userAgent: request.headers.get("user-agent") ?? undefined,
      ipHash: hashIp(ip),
      isTest,
    };
    await saveCall(call);

    return NextResponse.json({
      callId: call.id,
      sessionId: session.id,
      sdp: session.sdp,
      greeting: customer.prompts.greeting,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = error instanceof OpenAIError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { nanoid } from "nanoid";
import { getCustomer } from "@/lib/store";
import {
  deleteCall,
  listCalls,
  listLiveSessions,
  markLive,
  saveCall,
} from "@/lib/calls";
import { visitorId } from "@/lib/visitor";
import { demoAllowance, inFlightCalls } from "@/lib/analytics";
import { DEFAULT_DEMO_MINUTES } from "@/lib/types";
import { isAdminRequest } from "@/lib/auth";
import { callClock, safeTimeZone } from "@/lib/call-clock";
import { OpenAIError, createLiveSession } from "@/lib/openai";
import type { CallLog } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60_000;

/**
 * Two ceilings, because two different things can go wrong.
 *
 * gpt-live-1 is rate limited by concurrent sessions per organisation — 25 on
 * tier 1, 50 on tier 2 — and extra API keys share that pool rather than adding
 * to it, so the only ways up are a higher tier or a separate organisation.
 * LIVE_SESSION_LIMIT is what this deployment believes it may hold open, and
 * keeping it a little under the real figure means a caller hears "busy, try
 * again" from us instead of a rate limit error from OpenAI.
 *
 * The per-demo ceiling is the fairness half: several colleagues trying one
 * demo together is the whole point, but one busy demo must not spend every
 * session the other demos need.
 */
const CONCURRENT_PER_CUSTOMER = Number(process.env.CONCURRENT_PER_CUSTOMER || 4);
const LIVE_SESSION_LIMIT = Number(process.env.LIVE_SESSION_LIMIT || 20);

/** For a browser that sent no timezone, or one that is not a timezone. */
const DEFAULT_TIMEZONE = safeTimeZone(
  process.env.DEFAULT_TIMEZONE,
  "America/Los_Angeles",
);

const BUSY_DEMO =
  "This demo already has as many people on it as it can take at once. Try again in a moment.";
const BUSY_EVERYWHERE =
  "All the demo lines are busy right now. Try again in a moment.";

/**
 * A per-instance memory of who has dialled recently. Serverless runs many
 * instances, so this thins out bursts rather than enforcing an exact number;
 * the real protection against one prospect running up the bill is the demo
 * allowance, which is stored and shared.
 */
const recentByIp = new Map<string, number[]>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const hits = (recentByIp.get(key) ?? []).filter((at) => now - at < RATE_WINDOW_MS);
  hits.push(now);
  recentByIp.set(key, hits);

  // Without this the map keeps every address this instance has ever seen.
  if (recentByIp.size > 5000) {
    for (const [ip, times] of recentByIp) {
      if (times.every((at) => now - at >= RATE_WINDOW_MS)) recentByIp.delete(ip);
    }
  }

  return hits.length > RATE_LIMIT;
}

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "local";
}

export async function POST(request: Request) {
  let body: {
    customerId?: string;
    sdp?: string;
    isTest?: boolean;
    timeZone?: unknown;
  };
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

  // A test call is one the operator made from the admin test panel, which says
  // so in the body. Inferring it from the admin cookie marked every call the
  // operator made through a prospect's own link as a test, and those calls then
  // vanished from every number on the dashboard. The cookie check stays as the
  // authorisation half: test calls skip the demo allowance, so a prospect must
  // not be able to claim one.
  const isTest = body.isTest === true && (await isAdminRequest());

  // The demo is a fixed amount of time per prospect. Running out is the nudge:
  // the page then offers the contact form instead of the call button. An admin
  // test call does not spend it, which is why this runs after isTest.
  if (!isTest) {
    let allowance;
    let live: number;
    try {
      const calls = await listCalls(customer.id);
      live = inFlightCalls(calls).length;
      allowance = demoAllowance(
        calls,
        customer.demoMinutes ?? DEFAULT_DEMO_MINUTES,
      );
    } catch (error) {
      return jsonError(error);
    }
    if (live >= CONCURRENT_PER_CUSTOMER) {
      return NextResponse.json({ error: BUSY_DEMO }, { status: 429 });
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

  // The record is written before OpenAI is asked for a session, so that the
  // next person to dial can see this call already counting. Creating it
  // afterwards left a window the width of an OpenAI round trip in which every
  // simultaneous caller read an empty demo and was waved through.
  const call: CallLog = {
    id: nanoid(12),
    customerId: customer.id,
    liveSessionId: "",
    startedAt: new Date().toISOString(),
    status: "started",
    transcript: [],
    userAgent: request.headers.get("user-agent") ?? undefined,
    visitorId: await visitorId(),
    isTest,
  };
  try {
    await saveCall(call);
    if (!isTest) await markLive(call);
  } catch (error) {
    return jsonError(error);
  }

  // Reserving and then looking again is what makes the cap hold when several
  // people dial in the same instant: checking first and writing second leaves
  // a gap in which everyone reads an empty demo. Whoever is holding the oldest
  // reservations keeps them, decided the same way on every instance, and the
  // rest stand down.
  if (!isTest) {
    try {
      const inFlight = inFlightCalls(await listCalls(customer.id)).sort(
        (a, b) => a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id),
      );
      const place = inFlight.findIndex((entry) => entry.id === call.id);
      if (place >= CONCURRENT_PER_CUSTOMER) {
        await deleteCall(customer.id, call.id).catch(() => undefined);
        return NextResponse.json({ error: BUSY_DEMO }, { status: 429 });
      }

      // And the same again for the account as a whole, so we run out of demo
      // lines politely rather than being cut off by OpenAI.
      const everywhere = await listLiveSessions();
      everywhere.sort(
        (a, b) => a.startedAtMs - b.startedAtMs || a.callId.localeCompare(b.callId),
      );
      const seat = everywhere.findIndex((entry) => entry.callId === call.id);
      if (seat >= LIVE_SESSION_LIMIT) {
        await deleteCall(customer.id, call.id).catch(() => undefined);
        return NextResponse.json({ error: BUSY_EVERYWHERE }, { status: 429 });
      }
    } catch (error) {
      await deleteCall(customer.id, call.id).catch(() => undefined);
      return jsonError(error);
    }
  }

  // The stored prompts cannot know what day it is, so the date goes on here,
  // per call, and onto both: the voice hears "tomorrow" and the model it
  // delegates to is the one that takes the booking.
  const clock = callClock(
    new Date(),
    safeTimeZone(body.timeZone, DEFAULT_TIMEZONE),
    customer.profile.hours,
  );

  try {
    const session = await createLiveSession(
      {
        model: process.env.LIVE_MODEL || "gpt-live-1",
        instructions: `${customer.prompts.live}\n\n${clock}`,
        audio: { output: { voice: customer.voice } },
        delegation: {
          type: "responses",
          responses: {
            model: process.env.BACKEND_MODEL || "gpt-5.6-terra",
            instructions: `${customer.prompts.backend}\n\n${clock}`,
          },
        },
        store: false,
      },
      sdp,
    );

    await saveCall({ ...call, liveSessionId: session.id });

    return NextResponse.json({
      callId: call.id,
      sessionId: session.id,
      sdp: session.sdp,
      greeting: customer.prompts.greeting,
    });
  } catch (error) {
    // No session means no call. Take the reservation back rather than leaving
    // a record that spends the allowance and blocks a slot for ten minutes.
    await deleteCall(customer.id, call.id).catch(() => undefined);
    const message = error instanceof Error ? error.message : String(error);
    const status = error instanceof OpenAIError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

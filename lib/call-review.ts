import { extractJson } from "./claude-cli";
import { createResponse } from "./openai";
import { transcriptText } from "./transcript";
import type { CallLog, CallReview, CallSentiment } from "./types";

/**
 * A demo call is a usability test nobody scheduled. The transcript records what
 * happened; this turns it into the three things that change the product — what
 * the caller came to do, what the receptionist handled, and where it ran out of
 * road. Grouping the last of those across calls is how a repeated failure stops
 * looking like one bad call.
 *
 * The model reads the transcript and nothing else. It is not given the business
 * profile, because the useful finding is exactly when the receptionist did not
 * know something, and a model holding the answer tends to forgive the gap.
 */

function model(): string {
  return process.env.CALL_REVIEW_MODEL || "gpt-5.6-terra";
}

/** Long enough that a slow model still lands, short enough not to hold a report open. */
const TIMEOUT_MS = 45_000;

/** Below this there is nothing to judge, and asking anyway invents a finding. */
const MIN_CALLER_LINES = 2;

const INSTRUCTIONS = [
  "You are reviewing one call to an AI phone receptionist that was built as a demo for a business.",
  "The person calling is evaluating it, not a real customer.",
  "Judge only from the transcript. Do not invent facts about the business.",
  "Be concrete and specific — name what was asked and what the receptionist actually said.",
  "The point of the review is to decide what to fix, so a gap is worth more than praise.",
  "Answer with JSON only, no prose around it, in this shape:",
  JSON.stringify({
    tested: "one sentence on what the caller was trying to get done",
    worked: "one sentence on what the receptionist handled well",
    struggled:
      "one sentence on where it fell short, or an empty string if nothing did",
    gaps: [
      "a short fixable item, six words or so, e.g. 'did not know opening hours'",
    ],
    sentiment: "happy | mixed | frustrated",
  }),
  "gaps: at most three, each a fixable shortcoming of the receptionist. Use an empty array when the call went cleanly.",
].join("\n");

const SENTIMENTS: CallSentiment[] = ["happy", "mixed", "frustrated"];

function line(value: unknown, max = 280): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function parseReview(text: string): Omit<CallReview, "at" | "model"> | null {
  let parsed: unknown;
  try {
    parsed = extractJson(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const raw = parsed as Record<string, unknown>;

  const tested = line(raw.tested);
  // Without this there is nothing to show, and a card that says only
  // "frustrated" is worse than no card.
  if (!tested) return null;

  const gaps = Array.isArray(raw.gaps)
    ? raw.gaps.map((gap) => line(gap, 120)).filter(Boolean).slice(0, 3)
    : [];
  const sentiment = SENTIMENTS.includes(raw.sentiment as CallSentiment)
    ? (raw.sentiment as CallSentiment)
    : "mixed";

  return { tested, worked: line(raw.worked), struggled: line(raw.struggled), gaps, sentiment };
}

/** True when there is enough of a call to say anything honest about it. */
export function reviewable(call: CallLog): boolean {
  const caller = call.transcript.filter(
    (entry) => entry.speaker === "caller" && entry.text.trim(),
  );
  return caller.length >= MIN_CALLER_LINES;
}

/**
 * Never throws. A review is worth having and never worth failing a call report
 * for, so every failure here is the same as not having asked.
 */
export async function reviewCall(call: CallLog): Promise<CallReview | null> {
  if (!reviewable(call)) return null;
  if (!process.env.OPENAI_API_KEY) return null;

  const transcript = transcriptText(call.transcript).slice(0, 24_000);
  const used = model();

  try {
    const result = await createResponse(
      {
        model: used,
        instructions: INSTRUCTIONS,
        input: transcript,
        max_output_tokens: 700,
      },
      TIMEOUT_MS,
    );
    const parsed = parseReview(result.text);
    if (!parsed) return null;
    return { ...parsed, at: new Date().toISOString(), model: used };
  } catch {
    return null;
  }
}

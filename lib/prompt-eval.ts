import { extractJson } from "./claude-cli";

/**
 * The pure half of the prompt evals in `evals/`: what a scenario is, the checks
 * that need no model, and reading a judge's verdict. The half that calls a
 * model lives in `evals/` and never runs with `npx vitest run`, which stays
 * offline.
 *
 * The point is to judge a prompt change on every kind of business at once,
 * before a prospect hears it, so a rule that fixes the dentist and quietly
 * breaks the pizzeria shows up as a failed row rather than a bad demo.
 */

export type EvalTurn = { speaker: "caller" | "receptionist"; text: string };

export type Scenario = {
  id: string;
  /** Which prompt is under test. "live" runs on a text model, so it is a proxy. */
  target: "backend" | "live";
  /** Fixture ids from `evals/fixtures.ts` it runs against. */
  fixtures: string[];
  /** The call so far. The last turn is the caller's. */
  turns: EvalTurn[];
  /** What a good reply does, in a sentence the judge can hold it to. */
  expect: string;
  /** live only: whether a good reply hands the turn to the backend. */
  delegate?: boolean;
  /** backend only: the request is complete, so the reply must say it is a demo. */
  demoNotice?: boolean;
};

export type Verdict = { pass: boolean; reason: string };

/** "Caller: …\nReceptionist: …", the way the transcript sheet reads. */
export function conversationText(turns: EvalTurn[]): string {
  return turns
    .map((turn) => `${turn.speaker === "caller" ? "Caller" : "Receptionist"}: ${turn.text}`)
    .join("\n");
}

/** Phrases that deny a booking, which must not count as claiming one. */
const DENIALS =
  /\b(?:not|never|isn't|is not|won't be|nothing(?: is| gets)?)\s+(?:actually\s+|really\s+)?(?:booked|confirmed)\b/gi;

/** True when the reply claims the booking went through. */
export function claimsBooking(reply: string): boolean {
  return /\b(?:confirmed|booked)\b/i.test(reply.replace(DENIALS, ""));
}

/**
 * Checks that need no judge, for a backend reply the receptionist will say
 * aloud. Each returned string is a failure.
 */
export function speakableProblems(reply: string, scenario: Scenario): string[] {
  const problems: string[] = [];
  const text = reply.trim();
  if (!text) return ["empty reply"];
  if (/https?:\/\//i.test(text)) problems.push("has a link");
  if (/(^|\n)\s*(?:[-*•]|\d+\.)\s/.test(text) || /[*#`]/.test(text)) {
    problems.push("has markdown or a list");
  }
  // Two sentences is the rule; three leaves room for a short read-back.
  const sentences = text.split(/(?<=[.!?。？！])\s+/).filter(Boolean);
  if (sentences.length > 3) problems.push(`${sentences.length} sentences`);
  if (claimsBooking(text)) problems.push("claims the booking is confirmed");
  if (scenario.demoNotice && !/\bdemo\b|데모/i.test(text)) {
    problems.push("does not say it is a demo");
  }
  return problems;
}

/** For the live proxy: the model is asked to answer in this shape. */
export const LIVE_PROXY_FORMAT =
  'Reply with JSON only: {"say": "what you say aloud next", "delegate": true or false}. ' +
  "Set delegate to true only if, following your instructions, you would hand this turn to the backend now.";

export type LiveProxyReply = { say: string; delegate: boolean };

export function parseLiveProxy(text: string): LiveProxyReply | null {
  try {
    const raw = extractJson(text) as Record<string, unknown>;
    if (typeof raw?.say !== "string" || typeof raw?.delegate !== "boolean") return null;
    return { say: raw.say, delegate: raw.delegate };
  } catch {
    return null;
  }
}

/**
 * The judge is given the call, the reply and the expectation, and not the
 * business profile: like the call review, a judge holding the answer tends to
 * forgive the gap. Expectations are written to be checkable without it.
 */
export const JUDGE_INSTRUCTIONS = [
  "You grade one reply from an AI phone receptionist against one expectation.",
  "Judge only whether the reply meets the expectation. Ignore style unless the expectation mentions it.",
  'Answer with JSON only: {"pass": true or false, "reason": "one short sentence"}.',
].join("\n");

export function judgeInput(scenario: Scenario, reply: string): string {
  return [
    "The call so far:",
    conversationText(scenario.turns),
    "",
    "The receptionist's reply:",
    reply,
    "",
    `Expectation: ${scenario.expect}`,
  ].join("\n");
}

export function parseVerdict(text: string): Verdict | null {
  try {
    const raw = extractJson(text) as Record<string, unknown>;
    if (typeof raw?.pass !== "boolean") return null;
    return { pass: raw.pass, reason: typeof raw.reason === "string" ? raw.reason : "" };
  } catch {
    return null;
  }
}

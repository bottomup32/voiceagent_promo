import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { callClock } from "../lib/call-clock";
import { createResponse } from "../lib/openai";
import { buildPrompts } from "../lib/prompt";
import {
  JUDGE_INSTRUCTIONS,
  LIVE_PROXY_FORMAT,
  conversationText,
  judgeInput,
  parseLiveProxy,
  parseVerdict,
  speakableProblems,
  type Scenario,
} from "../lib/prompt-eval";
import { FIXTURES } from "./fixtures";
import { SCENARIOS } from "./scenarios";

/**
 * Runs every scenario against every fixture it names, on real models, and
 * grades the reply. Costs money and needs OPENAI_API_KEY (read from .env.local
 * too); without it every row is skipped.
 *
 *   npx vitest run -c vitest.eval.config.ts
 *   npx vitest run -c vitest.eval.config.ts -t emergency
 *
 * "backend" rows use the backend prompt exactly as /api/session sends it, on
 * BACKEND_MODEL. The Live service hands the backend its own summary of the
 * call, which we cannot reproduce, so the call is passed as plain text.
 *
 * "live" rows are a proxy. GPT-Live has no text mode to test against, so the
 * voice prompt runs on a text model and is asked what it would say and
 * whether it would delegate. It shows whether the instructions are clear; it
 * does not show what the voice model will do on a call. Check those on a call.
 *
 * Each run writes evals/results/<time>.json (gitignored). Compare two runs
 * before and after a prompt change, across every fixture.
 */

const HAS_KEY = Boolean(process.env.OPENAI_API_KEY);
const BACKEND_MODEL = process.env.BACKEND_MODEL || "gpt-5.6-terra";
const LIVE_PROXY_MODEL = process.env.EVAL_LIVE_PROXY_MODEL || BACKEND_MODEL;
const JUDGE_MODEL = process.env.EVAL_JUDGE_MODEL || process.env.CALL_REVIEW_MODEL || BACKEND_MODEL;

/** Monday 21 September 2026, 3:42 PM in Los Angeles. See evals/scenarios.ts. */
const NOW = new Date("2026-09-21T22:42:00Z");
const TIMEZONE = "America/Los_Angeles";

type Row = {
  scenario: string;
  fixture: string;
  target: Scenario["target"];
  reply: string;
  delegated?: boolean;
  problems: string[];
  verdict: { pass: boolean; reason: string } | null;
  pass: boolean;
};

const rows: Row[] = [];

async function judge(scenario: Scenario, reply: string) {
  const result = await createResponse(
    {
      model: JUDGE_MODEL,
      instructions: JUDGE_INSTRUCTIONS,
      input: judgeInput(scenario, reply),
      max_output_tokens: 300,
    },
    60_000,
  );
  return parseVerdict(result.text);
}

async function run(scenario: Scenario, fixtureId: string): Promise<Row> {
  const fixture = FIXTURES.find((entry) => entry.id === fixtureId)!;
  const prompts = buildPrompts(fixture.profile, fixture.agentName, fixture.language);
  const clock = callClock(NOW, TIMEZONE, fixture.profile.hours);

  let reply = "";
  let delegated: boolean | undefined;
  const problems: string[] = [];

  if (scenario.target === "backend") {
    const result = await createResponse(
      {
        model: BACKEND_MODEL,
        instructions: `${prompts.backend}\n\n${clock}`,
        input: `${conversationText(scenario.turns)}\n\nHandle the caller's last turn.`,
        max_output_tokens: 400,
      },
      90_000,
    );
    reply = result.text.trim();
    problems.push(...speakableProblems(reply, scenario));
  } else {
    const result = await createResponse(
      {
        model: LIVE_PROXY_MODEL,
        instructions: `${prompts.live}\n\n${clock}\n\n${LIVE_PROXY_FORMAT}`,
        input: conversationText(scenario.turns),
        max_output_tokens: 400,
      },
      90_000,
    );
    const parsed = parseLiveProxy(result.text);
    if (!parsed) {
      problems.push("live proxy reply was not the JSON asked for");
      reply = result.text.trim();
    } else {
      reply = parsed.say;
      delegated = parsed.delegate;
      if (parsed.delegate !== scenario.delegate) {
        problems.push(parsed.delegate ? "delegated when it should not" : "did not delegate");
      }
    }
  }

  const verdict = reply ? await judge(scenario, reply) : null;
  if (!verdict) problems.push("judge gave no verdict");

  return {
    scenario: scenario.id,
    fixture: fixtureId,
    target: scenario.target,
    reply,
    delegated,
    problems,
    verdict,
    pass: problems.length === 0 && Boolean(verdict?.pass),
  };
}

describe.skipIf(!HAS_KEY)("prompt evals", () => {
  for (const scenario of SCENARIOS) {
    for (const fixtureId of scenario.fixtures) {
      it.concurrent(`${scenario.target} · ${scenario.id} · ${fixtureId}`, async () => {
        const row = await run(scenario, fixtureId);
        rows.push(row);
        const why = [...row.problems, row.verdict?.reason].filter(Boolean).join("; ");
        expect(row.pass, `${why}\nReply: ${row.reply}`).toBe(true);
      });
    }
  }

  afterAll(() => {
    if (!rows.length) return;
    rows.sort((a, b) => a.scenario.localeCompare(b.scenario) || a.fixture.localeCompare(b.fixture));
    const passed = rows.filter((row) => row.pass).length;
    const dir = path.join(process.cwd(), "evals", "results");
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    writeFileSync(
      file,
      JSON.stringify(
        { at: new Date().toISOString(), models: { BACKEND_MODEL, LIVE_PROXY_MODEL, JUDGE_MODEL }, passed, total: rows.length, rows },
        null,
        2,
      ),
    );
    console.log(`\nPrompt evals: ${passed}/${rows.length} passed. Written to ${file}`);
    for (const row of rows.filter((entry) => !entry.pass)) {
      console.log(`  ✗ ${row.target} · ${row.scenario} · ${row.fixture}: ${[...row.problems, row.verdict?.reason].filter(Boolean).join("; ")}`);
    }
  });
});

describe.runIf(!HAS_KEY)("prompt evals", () => {
  it("need OPENAI_API_KEY (in the environment or .env.local)", () => {
    expect(HAS_KEY).toBe(false);
  });
});

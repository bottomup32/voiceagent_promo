import Anthropic from "@anthropic-ai/sdk";
import { ClaudeCliError, runClaude } from "./claude-cli";
import { createResponse } from "./openai";
import type { ResearchSource } from "./types";

/**
 * Research needs a model that can search the web. Three ways to get one:
 *
 * - the Claude Code CLI on this machine, which runs on the operator's Claude
 *   subscription and costs nothing per run,
 * - the OpenAI Responses API with its web search tool, which reuses the key
 *   the voice side already needs, and
 * - the Anthropic API, for a host that has neither.
 *
 * A subscription only ever works through a CLI signed in on a machine, so a
 * serverless host has to use one of the two APIs.
 *
 * All three take a prompt and return text, so `lib/research.ts` does not care
 * which one answered.
 */

export type ResearchProvider = "cli" | "openai" | "anthropic";

export type ResearchRun = {
  text: string;
  costUsd?: number;
  provider: ResearchProvider;
  /** Sources the provider cited itself, where it reports them. */
  citations?: ResearchSource[];
};

const PROVIDERS: ResearchProvider[] = ["cli", "openai", "anthropic"];

export function resolveProvider(): ResearchProvider {
  const configured = process.env.RESEARCH_PROVIDER?.trim().toLowerCase();
  if (PROVIDERS.includes(configured as ResearchProvider)) {
    return configured as ResearchProvider;
  }
  // A serverless host has no CLI to spawn, so an API is the only way there.
  // Prefer the key that is already present for the voice.
  if (process.env.VERCEL) {
    return process.env.OPENAI_API_KEY ? "openai" : "anthropic";
  }
  return "cli";
}

function apiModel(): string {
  return process.env.RESEARCH_API_MODEL || "claude-opus-5";
}

function cliModel(): string {
  return process.env.RESEARCH_MODEL || "sonnet";
}

function openaiModel(): string {
  return process.env.RESEARCH_OPENAI_MODEL || "gpt-5.6-terra";
}

function searchContextSize(): "low" | "medium" | "high" {
  const configured = process.env.RESEARCH_SEARCH_CONTEXT?.trim().toLowerCase();
  return configured === "low" || configured === "high" ? configured : "medium";
}

/**
 * Both passes have to finish inside one serverless invocation, so the searching
 * pass gets the long budget and the pass that only reformats gets the short one.
 */
const SEARCH_TIMEOUT_MS = 180_000;
const PLAIN_TIMEOUT_MS = 90_000;

async function runViaOpenAI(prompt: string, withSearch: boolean): Promise<ResearchRun> {
  const result = await createResponse(
    {
      model: openaiModel(),
      input: prompt,
      tools: withSearch
        ? [{ type: "web_search", search_context_size: searchContextSize() }]
        : [],
      max_output_tokens: 8000,
    },
    withSearch ? SEARCH_TIMEOUT_MS : PLAIN_TIMEOUT_MS,
  );

  return {
    text: result.text,
    provider: "openai",
    citations: result.citations,
  };
}

async function runViaApi(prompt: string, withSearch: boolean): Promise<ResearchRun> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new ClaudeCliError(
      "Research is set to the Anthropic API but ANTHROPIC_API_KEY is not set. Set the key, or set RESEARCH_PROVIDER to openai or cli.",
    );
  }

  const client = new Anthropic();
  const stream = client.messages.stream({
    model: apiModel(),
    max_tokens: 16000,
    tools: withSearch
      ? [{ type: "web_search_20260209", name: "web_search", max_uses: 12 }]
      : [],
    messages: [{ role: "user", content: prompt }],
  });

  const message = await stream.finalMessage();
  if (message.stop_reason === "refusal") {
    throw new ClaudeCliError("The research request was declined by the model.");
  }

  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();

  return { text, provider: "anthropic" };
}

async function runViaCli(prompt: string, withSearch: boolean): Promise<ResearchRun> {
  const result = await runClaude(prompt, {
    tools: withSearch ? ["WebSearch", "WebFetch"] : [],
    model: cliModel(),
  });
  return { text: result.text, costUsd: result.costUsd, provider: "cli" };
}

export async function runResearchPrompt(
  prompt: string,
  options: { withSearch: boolean },
): Promise<ResearchRun> {
  switch (resolveProvider()) {
    case "openai":
      return runViaOpenAI(prompt, options.withSearch);
    case "anthropic":
      return runViaApi(prompt, options.withSearch);
    default:
      return runViaCli(prompt, options.withSearch);
  }
}

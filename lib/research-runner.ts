import Anthropic from "@anthropic-ai/sdk";
import { ClaudeCliError, runClaude } from "./claude-cli";

/**
 * Research needs a model that can search the web. Two ways to get one:
 *
 * - the Claude Code CLI on this machine, which runs on the operator's Claude
 *   subscription and costs nothing per run, and
 * - the Anthropic API, for hosts where no CLI exists, such as Vercel.
 *
 * Both take a prompt and return text, so `lib/research.ts` does not care which
 * one answered.
 */

export type ResearchProvider = "cli" | "anthropic";

export type ResearchRun = {
  text: string;
  costUsd?: number;
  provider: ResearchProvider;
};

export function resolveProvider(): ResearchProvider {
  const configured = process.env.RESEARCH_PROVIDER?.trim().toLowerCase();
  if (configured === "cli" || configured === "anthropic") return configured;
  // A serverless host has no CLI to spawn, so the API is the only way there.
  if (process.env.VERCEL) return "anthropic";
  return "cli";
}

function apiModel(): string {
  return process.env.RESEARCH_API_MODEL || "claude-opus-5";
}

function cliModel(): string {
  return process.env.RESEARCH_MODEL || "sonnet";
}

async function runViaApi(prompt: string, withSearch: boolean): Promise<ResearchRun> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new ClaudeCliError(
      "Research is set to the Anthropic API but ANTHROPIC_API_KEY is not set. Set the key, or set RESEARCH_PROVIDER=cli to use the Claude Code CLI.",
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
  return resolveProvider() === "anthropic"
    ? runViaApi(prompt, options.withSearch)
    : runViaCli(prompt, options.withSearch);
}

import { NextResponse } from "next/server";
import { existsSync } from "node:fs";
import { pingStore, storeKind } from "@/lib/kv";
import { resolveClaudeCli } from "@/lib/claude-cli";
import { resolveProvider } from "@/lib/research-runner";

export const runtime = "nodejs";

function researchCheck(provider: string, cliPresent: boolean) {
  if (provider === "openai") {
    const key = Boolean(process.env.OPENAI_API_KEY);
    return {
      provider,
      ok: key,
      model: process.env.RESEARCH_OPENAI_MODEL || "gpt-5.6-terra",
      note: key
        ? "OpenAI Responses API with web search, on the same key as the voice."
        : "OPENAI_API_KEY is not set, so research cannot run.",
    };
  }
  if (provider === "anthropic") {
    const key = Boolean(process.env.ANTHROPIC_API_KEY);
    return {
      provider,
      ok: key,
      model: process.env.RESEARCH_API_MODEL || "claude-opus-5",
      note: key ? "Anthropic API." : "ANTHROPIC_API_KEY is not set.",
    };
  }
  return {
    provider,
    ok: cliPresent,
    model: process.env.RESEARCH_MODEL || "sonnet",
    note: cliPresent
      ? "Claude Code CLI on this machine, on the operator's subscription."
      : "The Claude Code CLI was not found. Install it, set CLAUDE_CLI_PATH, or set RESEARCH_PROVIDER to openai or anthropic.",
  };
}

/** What the deployment can actually do, so a broken env is visible at a glance. */
export async function GET() {
  const provider = resolveProvider();
  const store = storeKind();
  const reachable = await pingStore();
  const onVercel = Boolean(process.env.VERCEL);
  const cliPath = resolveClaudeCli();
  const cliPresent = cliPath.includes("/") || cliPath.includes("\\")
    ? existsSync(cliPath)
    : false;

  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? "unknown";

  const checks = {
    storage: {
      kind: store,
      ok: (!onVercel || store === "redis") && reachable.ok,
      note: !reachable.ok
        ? reachable.error
        : store === "redis"
          ? "Shared Redis store, and it answers."
          : onVercel
            ? "Writing to the filesystem on a serverless host. Data will not persist. Set KV_REST_API_URL and KV_REST_API_TOKEN."
            : "JSON files under data/.",
    },
    research: researchCheck(provider, cliPresent),
    voice: {
      ok: Boolean(process.env.OPENAI_API_KEY),
      model: process.env.LIVE_MODEL || "gpt-live-1",
      note: process.env.OPENAI_API_KEY
        ? "OPENAI_API_KEY is set."
        : "OPENAI_API_KEY is not set, so calls cannot start.",
    },
    links: {
      ok: Boolean(process.env.NEXT_PUBLIC_BASE_URL),
      baseUrl: process.env.NEXT_PUBLIC_BASE_URL ?? null,
      note: process.env.NEXT_PUBLIC_BASE_URL
        ? "Customer links use this origin. It is baked in at build time, so changing it needs a redeploy."
        : "NEXT_PUBLIC_BASE_URL is not set, so copied links fall back to the current origin.",
    },
  };

  const ok = Object.values(checks).every((check) => check.ok);
  return NextResponse.json({ ok, version, onVercel, checks }, { status: ok ? 200 : 503 });
}

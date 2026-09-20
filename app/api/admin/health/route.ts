import { NextResponse } from "next/server";
import { existsSync } from "node:fs";
import { storeKind } from "@/lib/kv";
import { resolveClaudeCli } from "@/lib/claude-cli";
import { resolveProvider } from "@/lib/research-runner";

export const runtime = "nodejs";

/** What the deployment can actually do, so a broken env is visible at a glance. */
export async function GET() {
  const provider = resolveProvider();
  const store = storeKind();
  const onVercel = Boolean(process.env.VERCEL);
  const cliPath = resolveClaudeCli();
  const cliPresent = cliPath.includes("/") || cliPath.includes("\\")
    ? existsSync(cliPath)
    : false;

  const checks = {
    storage: {
      kind: store,
      ok: !onVercel || store === "redis",
      note:
        store === "redis"
          ? "Shared Redis store."
          : onVercel
            ? "Writing to the filesystem on a serverless host. Data will not persist. Set KV_REST_API_URL and KV_REST_API_TOKEN."
            : "JSON files under data/.",
    },
    research: {
      provider,
      ok:
        provider === "anthropic"
          ? Boolean(process.env.ANTHROPIC_API_KEY)
          : cliPresent,
      note:
        provider === "anthropic"
          ? process.env.ANTHROPIC_API_KEY
            ? "Anthropic API."
            : "ANTHROPIC_API_KEY is not set."
          : cliPresent
            ? "Claude Code CLI on this machine."
            : "The Claude Code CLI was not found. Install it, set CLAUDE_CLI_PATH, or set RESEARCH_PROVIDER=anthropic.",
    },
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
        ? "Customer links use this origin."
        : "NEXT_PUBLIC_BASE_URL is not set, so copied links fall back to the current origin.",
    },
  };

  const ok = Object.values(checks).every((check) => check.ok);
  return NextResponse.json({ ok, onVercel, checks }, { status: ok ? 200 : 503 });
}

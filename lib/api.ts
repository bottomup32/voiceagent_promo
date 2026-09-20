import { NextResponse } from "next/server";
import { StoreConfigError } from "./kv";
import { ClaudeCliError } from "./claude-cli";
import { OpenAIError } from "./openai";

/**
 * An unhandled throw in a route handler returns an empty 500, which reaches
 * the browser as "Unexpected end of JSON input" and tells nobody anything.
 * Every route catches instead and comes through here.
 */
export function jsonError(error: unknown): NextResponse {
  if (error instanceof StoreConfigError) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }
  if (error instanceof OpenAIError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof ClaudeCliError) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }

  const message = error instanceof Error ? error.message : String(error);
  console.error("[api]", error);
  return NextResponse.json({ error: message }, { status: 500 });
}

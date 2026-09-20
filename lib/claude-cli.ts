import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";

/**
 * Runs research through the locally installed Claude Code CLI in headless
 * mode, which authenticates with the user's Claude subscription. No API key.
 */

export class ClaudeCliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClaudeCliError";
  }
}

const CANDIDATES = [
  process.env.CLAUDE_CLI_PATH,
  path.join(homedir(), ".local", "bin", "claude.exe"),
  path.join(homedir(), ".local", "bin", "claude"),
];

export function resolveClaudeCli(): string {
  for (const candidate of CANDIDATES) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  // Fall back to PATH lookup; spawn resolves it on both platforms.
  return process.platform === "win32" ? "claude.exe" : "claude";
}

export type ClaudeRunOptions = {
  /** Tools the run may use. Empty array means no tools at all. */
  tools?: string[];
  model?: string;
  timeoutMs?: number;
  /** Working directory for the run. Defaults to a neutral temp folder so the
   *  app's own CLAUDE.md and skills never leak into the research prompt. */
  cwd?: string;
};

export type ClaudeRunResult = {
  text: string;
  costUsd?: number;
  turns?: number;
  durationMs?: number;
  sessionId?: string;
};

export function buildArgs(prompt: string, options: ClaudeRunOptions = {}): string[] {
  const args = [
    "-p",
    prompt,
    "--output-format",
    "json",
    "--disable-slash-commands",
    "--setting-sources",
    "user",
    "--model",
    options.model ?? "sonnet",
  ];

  const tools = options.tools ?? [];
  if (tools.length > 0) {
    args.push("--allowed-tools", ...tools);
  } else {
    args.push("--allowed-tools", "none");
  }

  return args;
}

type CliEnvelope = {
  is_error?: boolean;
  result?: string;
  total_cost_usd?: number;
  num_turns?: number;
  duration_ms?: number;
  session_id?: string;
  subtype?: string;
};

export async function runClaude(
  prompt: string,
  options: ClaudeRunOptions = {},
): Promise<ClaudeRunResult> {
  const executable = resolveClaudeCli();
  const args = buildArgs(prompt, options);
  const timeoutMs = options.timeoutMs ?? 240_000;

  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];

  const child = spawn(executable, args, {
    cwd: options.cwd ?? tmpdir(),
    windowsHide: true,
    env: { ...process.env, CLAUDE_CODE_ENTRYPOINT: "voiceagent-research" },
  });

  const finished = new Promise<number | null>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new ClaudeCliError(`Research timed out after ${timeoutMs / 1000}s.`));
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(
        new ClaudeCliError(
          `Could not run the Claude CLI (${executable}): ${error.message}. Install Claude Code, or set CLAUDE_CLI_PATH.`,
        ),
      );
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });

  const code = await finished;
  const raw = Buffer.concat(stdout).toString("utf8").trim();
  const errorOutput = Buffer.concat(stderr).toString("utf8").trim();

  if (!raw) {
    throw new ClaudeCliError(
      errorOutput || `The Claude CLI exited with code ${code} and no output.`,
    );
  }

  let envelope: CliEnvelope;
  try {
    envelope = JSON.parse(raw) as CliEnvelope;
  } catch {
    throw new ClaudeCliError(`Unexpected Claude CLI output: ${raw.slice(0, 400)}`);
  }

  if (envelope.is_error) {
    const message = envelope.result || envelope.subtype || "The research run failed.";
    throw new ClaudeCliError(
      message.includes("login")
        ? "The Claude CLI is not signed in. Run `claude` once in a terminal and sign in with your subscription."
        : message,
    );
  }

  return {
    text: (envelope.result ?? "").trim(),
    costUsd: envelope.total_cost_usd,
    turns: envelope.num_turns,
    durationMs: envelope.duration_ms,
    sessionId: envelope.session_id,
  };
}

/** Pulls a JSON object out of a reply that may be fenced or padded with prose. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1].trim() : trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1));
    }
    throw new ClaudeCliError(
      `The research reply was not valid JSON: ${candidate.slice(0, 300)}`,
    );
  }
}

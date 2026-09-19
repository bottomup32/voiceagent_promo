import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./store";
import type { CallLog, TrackEvent } from "./types";

const CALLS_DIR = path.join(DATA_DIR, "calls");
const EVENTS_FILE = path.join(DATA_DIR, "events.jsonl");

export { STALE_CALL_MS } from "./analytics";

export function hashIp(ip: string | null | undefined): string | undefined {
  if (!ip) return undefined;
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

export async function saveCall(call: CallLog): Promise<CallLog> {
  const dir = path.join(CALLS_DIR, call.customerId);
  await fs.mkdir(dir, { recursive: true });
  const target = path.join(dir, `${call.id}.json`);
  const tmp = `${target}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(call, null, 2), "utf8");
  await fs.rename(tmp, target);
  return call;
}

export async function findCall(callId: string): Promise<CallLog | null> {
  if (!/^[A-Za-z0-9_-]{6,32}$/.test(callId)) return null;
  let customerDirs: string[];
  try {
    customerDirs = await fs.readdir(CALLS_DIR);
  } catch {
    return null;
  }
  for (const dir of customerDirs) {
    try {
      const raw = await fs.readFile(path.join(CALLS_DIR, dir, `${callId}.json`), "utf8");
      return JSON.parse(raw) as CallLog;
    } catch {
      // Not in this customer's folder; keep looking.
    }
  }
  return null;
}

export async function listCalls(customerId: string): Promise<CallLog[]> {
  const dir = path.join(CALLS_DIR, customerId);
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }
  const calls: CallLog[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(dir, file), "utf8");
      calls.push(JSON.parse(raw) as CallLog);
    } catch {
      // Skip unreadable entries.
    }
  }
  calls.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return calls;
}

export async function listAllCalls(): Promise<CallLog[]> {
  let dirs: string[];
  try {
    dirs = await fs.readdir(CALLS_DIR);
  } catch {
    return [];
  }
  const all: CallLog[] = [];
  for (const dir of dirs) {
    all.push(...(await listCalls(dir)));
  }
  all.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return all;
}

export async function appendEvent(event: TrackEvent): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.appendFile(EVENTS_FILE, `${JSON.stringify(event)}\n`, "utf8");
}

export async function readEvents(): Promise<TrackEvent[]> {
  let raw: string;
  try {
    raw = await fs.readFile(EVENTS_FILE, "utf8");
  } catch {
    return [];
  }
  const events: TrackEvent[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line) as TrackEvent);
    } catch {
      // Ignore a truncated last line.
    }
  }
  return events;
}

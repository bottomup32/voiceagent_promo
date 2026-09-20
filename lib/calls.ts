import { createHash } from "node:crypto";
import { getStore } from "./kv";
import type { CallLog, TrackEvent } from "./types";

export { STALE_CALL_MS } from "./analytics";

const EVENTS = "events";
const callKey = (customerId: string, callId: string) =>
  `calls:${customerId}:${callId}`;
const callIndex = (customerId: string) => `calls:${customerId}`;

export function hashIp(ip: string | null | undefined): string | undefined {
  if (!ip) return undefined;
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

export async function saveCall(call: CallLog): Promise<CallLog> {
  const store = getStore();
  await store.setJson(callKey(call.customerId, call.id), call);
  await store.addMember(callIndex(call.customerId), call.id);
  return call;
}

export async function listCalls(customerId: string): Promise<CallLog[]> {
  const store = getStore();
  const ids = await store.members(callIndex(customerId));
  const calls: CallLog[] = [];
  for (const id of ids) {
    const call = await store.getJson<CallLog>(callKey(customerId, id));
    if (call) calls.push(call);
  }
  calls.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return calls;
}

export async function findCall(callId: string): Promise<CallLog | null> {
  if (!/^[A-Za-z0-9_-]{6,32}$/.test(callId)) return null;
  const store = getStore();
  for (const customerId of await store.members("customers")) {
    const call = await store.getJson<CallLog>(callKey(customerId, callId));
    if (call) return call;
  }
  return null;
}

export async function listAllCalls(): Promise<CallLog[]> {
  const store = getStore();
  const all: CallLog[] = [];
  for (const customerId of await store.members("customers")) {
    all.push(...(await listCalls(customerId)));
  }
  all.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return all;
}

export async function appendEvent(event: TrackEvent): Promise<void> {
  await getStore().push(EVENTS, JSON.stringify(event));
}

export async function readEvents(): Promise<TrackEvent[]> {
  const lines = await getStore().range(EVENTS);
  const events: TrackEvent[] = [];
  for (const line of lines) {
    try {
      events.push(JSON.parse(line) as TrackEvent);
    } catch {
      // Ignore a truncated entry rather than losing the rest.
    }
  }
  return events;
}

import { getStore } from "./kv";
import type { CallLog, TrackEvent } from "./types";

export { STALE_CALL_MS } from "./analytics";

// Page views used to go into one global list, read in full on every admin
// request. They are per customer now so a busy prospect cannot slow down the
// dashboard, and so deleting a customer can take their views with them. The
// old list is still read and merged, so nothing recorded before this is lost.
const LEGACY_EVENTS = "events";
const eventsKey = (customerId: string) => `events:${customerId}`;
const callKey = (customerId: string, callId: string) =>
  `calls:${customerId}:${callId}`;
const callIndex = (customerId: string) => `calls:${customerId}`;

export async function saveCall(call: CallLog): Promise<CallLog> {
  const store = getStore();
  await store.setJson(callKey(call.customerId, call.id), call);
  await store.addMember(callIndex(call.customerId), call.id);
  return call;
}

/** Undo a reservation when the call never actually started. */
export async function deleteCall(customerId: string, callId: string): Promise<void> {
  const store = getStore();
  await store.del(callKey(customerId, callId));
  await store.removeMember(callIndex(customerId), callId);
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

/**
 * The caller knows which customer it was talking to, so pass `customerId` and
 * this is one read. Without it every hang-up walks the whole customer list,
 * which on the Redis driver is one network round trip per customer, in series,
 * while the browser waits — and every simultaneous hang-up pays it again.
 * The scan stays as the fallback for a client that did not send one.
 */
export async function findCall(
  callId: string,
  customerId?: string,
): Promise<CallLog | null> {
  if (!/^[A-Za-z0-9_-]{6,32}$/.test(callId)) return null;
  const store = getStore();

  if (customerId && /^[A-Za-z0-9_-]{6,32}$/.test(customerId)) {
    const direct = await store.getJson<CallLog>(callKey(customerId, callId));
    if (direct) return direct;
  }

  for (const id of await store.members("customers")) {
    const call = await store.getJson<CallLog>(callKey(id, callId));
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
  await getStore().push(eventsKey(event.customerId), JSON.stringify(event));
}

function parseEvents(lines: string[]): TrackEvent[] {
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

/** Page views for one customer, or for every customer when given no id. */
export async function readEvents(customerId?: string): Promise<TrackEvent[]> {
  const store = getStore();
  const legacy = parseEvents(await store.range(LEGACY_EVENTS));

  if (customerId) {
    return [
      ...parseEvents(await store.range(eventsKey(customerId))),
      ...legacy.filter((event) => event.customerId === customerId),
    ];
  }

  const events: TrackEvent[] = [...legacy];
  for (const id of await store.members("customers")) {
    events.push(...parseEvents(await store.range(eventsKey(id))));
  }
  return events;
}

export async function dropEvents(customerId: string): Promise<void> {
  await getStore().dropList(eventsKey(customerId));
}

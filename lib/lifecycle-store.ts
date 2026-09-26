import { getStore, type Store } from "./kv";
import type { LifecycleEvent } from "./types";

/**
 * Every phase and stage move, one append-only list per customer — the same
 * shape as the CRM notes, for the same reason: a history is worth more than
 * a field that keeps being overwritten, and writing one line should not
 * rewrite the customer.
 */
const lifecycleKey = (customerId: string) => `lifecycle:${customerId}`;

export async function recordLifecycle(
  customerId: string,
  events: LifecycleEvent[],
  store: Store = getStore(),
): Promise<void> {
  for (const entry of events) {
    await store.push(lifecycleKey(customerId), JSON.stringify(entry));
  }
}

export async function listLifecycle(
  customerId: string,
  store: Store = getStore(),
): Promise<LifecycleEvent[]> {
  const events: LifecycleEvent[] = [];
  for (const line of await store.range(lifecycleKey(customerId))) {
    try {
      events.push(JSON.parse(line) as LifecycleEvent);
    } catch {
      // A truncated line costs that line, not the history.
    }
  }
  return events.sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));
}

export async function listAllLifecycle(
  customerIds: string[],
): Promise<(LifecycleEvent & { customerId: string })[]> {
  const perCustomer = await Promise.all(
    customerIds.map(async (customerId) =>
      (await listLifecycle(customerId)).map((entry) => ({ ...entry, customerId })),
    ),
  );
  return perCustomer.flat();
}

export async function dropLifecycle(customerId: string): Promise<void> {
  await getStore().dropList(lifecycleKey(customerId));
}

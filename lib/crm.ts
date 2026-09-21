import { nanoid } from "nanoid";
import { getStore } from "./kv";
import type { CrmNote } from "./types";

/**
 * Notes are their own append-only list rather than a field on the customer.
 * Writing one should not rewrite the whole record, and a sales note is worth
 * more as a history than as a box that keeps getting overwritten.
 *
 * The `notes` string on Customer stays where it is: that is the operator's
 * scratchpad, and this is the timeline.
 */
const notesKey = (customerId: string) => `notes:${customerId}`;

export async function listNotes(customerId: string): Promise<CrmNote[]> {
  const lines = await getStore().range(notesKey(customerId));
  const notes: CrmNote[] = [];
  for (const line of lines) {
    try {
      notes.push(JSON.parse(line) as CrmNote);
    } catch {
      // Ignore a truncated entry rather than losing the rest.
    }
  }
  return notes.sort((a, b) => b.at.localeCompare(a.at));
}

/**
 * Every prospect's notes at once, each tagged with whose it is, for the CRM
 * feed that reads across the whole pipeline.
 *
 * One read per customer, because the store has no SCAN and notes live in a
 * list per customer — the partitioning that keeps a busy prospect from slowing
 * the rest down costs a fan-out here. The operator's list is tens of records,
 * not thousands, and the reads go out together.
 */
export async function listAllNotes(
  customerIds: string[],
): Promise<(CrmNote & { customerId: string })[]> {
  const perCustomer = await Promise.all(
    customerIds.map(async (customerId) =>
      (await listNotes(customerId)).map((note) => ({ ...note, customerId })),
    ),
  );
  return perCustomer.flat().sort((a, b) => b.at.localeCompare(a.at));
}

export async function addNote(customerId: string, text: string): Promise<CrmNote> {
  const note: CrmNote = {
    id: nanoid(10),
    at: new Date().toISOString(),
    text: text.trim().slice(0, 2000),
  };
  await getStore().push(notesKey(customerId), JSON.stringify(note));
  return note;
}

export async function dropNotes(customerId: string): Promise<void> {
  await getStore().dropList(notesKey(customerId));
}

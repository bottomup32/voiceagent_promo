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

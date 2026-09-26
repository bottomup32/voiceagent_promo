import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { assertWritableStore, getStore } from "@/lib/kv";
import { assignCode, listCustomers, saveCustomer } from "@/lib/store";

export const runtime = "nodejs";

/**
 * Give every customer created before codes existed a code, and put back any
 * index entry that has gone missing. Safe to run twice: a customer with a
 * code keeps it, and an index entry that is there and correct is left alone.
 * An index entry that is there but points at a different customer is never
 * overwritten — that would steal the code out from under whoever it actually
 * belongs to — so it is only counted as `mismatched` for the operator to look
 * into by hand.
 */
export async function POST() {
  try {
    assertWritableStore();
    const store = getStore();
    let assigned = 0;
    let repaired = 0;
    let mismatched = 0;
    for (const customer of await listCustomers()) {
      if (!customer.code) {
        await saveCustomer({ ...customer, code: await assignCode(customer) });
        assigned += 1;
        continue;
      }
      const owner = await store.getJson<string>(`code:${customer.code}`);
      if (owner === customer.id) continue;
      if (owner === null) {
        if (await store.setIfAbsent(`code:${customer.code}`, customer.id)) {
          repaired += 1;
        }
      } else {
        mismatched += 1;
      }
    }
    return NextResponse.json({ assigned, repaired, mismatched });
  } catch (error) {
    return jsonError(error);
  }
}

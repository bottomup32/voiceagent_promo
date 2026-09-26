import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { assertWritableStore, getStore } from "@/lib/kv";
import { assignCode, listCustomers, saveCustomer } from "@/lib/store";

export const runtime = "nodejs";

/**
 * Give every customer created before codes existed a code, and put back any
 * index entry that has gone missing. Safe to run twice: a customer with a
 * code keeps it, and an index entry that is there is left alone.
 */
export async function POST() {
  try {
    assertWritableStore();
    const store = getStore();
    let assigned = 0;
    let repaired = 0;
    for (const customer of await listCustomers()) {
      if (!customer.code) {
        await saveCustomer({ ...customer, code: await assignCode(customer) });
        assigned += 1;
      } else if (await store.setIfAbsent(`code:${customer.code}`, customer.id)) {
        repaired += 1;
      }
    }
    return NextResponse.json({ assigned, repaired });
  } catch (error) {
    return jsonError(error);
  }
}

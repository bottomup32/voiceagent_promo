import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { listCustomers } from "@/lib/store";
import { listAllCalls, readEvents } from "@/lib/calls";
import { listAllNotes } from "@/lib/crm";
import {
  activityFeed,
  emptyStats,
  engagement,
  heatByCustomer,
  statsByCustomer,
} from "@/lib/analytics";
import type { CustomerWithStats } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Everything the pipeline board and its activity feed need, in one read.
 *
 * The board is a whole-pipeline view, so it cannot be assembled a customer at
 * a time the way the detail page is. Stats are all-time here rather than
 * windowed: a prospect who went quiet three weeks ago is exactly who the
 * operator is looking for, and a 30 day window would hide them.
 */
export async function GET() {
  try {
    const [customers, calls, events] = await Promise.all([
      listCustomers(),
      listAllCalls(),
      readEvents(),
    ]);
    const notes = await listAllNotes(customers.map((customer) => customer.id));

    const stats = statsByCustomer(calls, events);
    const heat = heatByCustomer(calls, stats);

    const withStats: CustomerWithStats[] = customers.map((customer) => ({
      ...customer,
      stats: stats[customer.id] ?? emptyStats(),
      heat: heat[customer.id] ?? engagement(emptyStats(), []),
    }));

    return NextResponse.json({
      customers: withStats,
      feed: activityFeed(
        {
          customers: customers.map((customer) => ({
            id: customer.id,
            name: customer.profile.name || customer.businessName || "Unnamed",
          })),
          notes,
          events,
          calls,
        },
        40,
      ),
    });
  } catch (error) {
    return jsonError(error);
  }
}

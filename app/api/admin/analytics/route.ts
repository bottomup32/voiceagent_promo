import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { listCustomers } from "@/lib/store";
import { listAllCalls, readEvents } from "@/lib/calls";
import {
  callsPerDay,
  computeKpis,
  countableCalls,
  emptyStats,
  statsByCustomer,
} from "@/lib/analytics";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const days = Number(new URL(request.url).searchParams.get("days") ?? 30);
  const window = [7, 30, 90].includes(days) ? days : 30;

  let customers, calls, events;
  try {
    [customers, calls, events] = await Promise.all([
      listCustomers(),
      listAllCalls(),
      readEvents(),
    ]);
  } catch (error) {
    return jsonError(error);
  }

  const stats = statsByCustomer(calls, events);
  const kpis = computeKpis(
    customers.map((customer) => customer.id),
    stats,
  );

  const nameFor = new Map(customers.map((c) => [c.id, c.profile.name || c.mapsUrl]));
  const contactFor = new Map(customers.map((c) => [c.id, c.contactName ?? ""]));

  const topCustomers = customers
    .map((customer) => ({
      id: customer.id,
      name: customer.profile.name || "Unnamed",
      minutes: Math.round(((stats[customer.id] ?? emptyStats()).totalSec / 60) * 10) / 10,
      calls: (stats[customer.id] ?? emptyStats()).calls,
    }))
    .filter((entry) => entry.calls > 0)
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 8);

  const recentCalls = calls.slice(0, 20).map((call) => ({
    id: call.id,
    customerId: call.customerId,
    customerName: nameFor.get(call.customerId) ?? "Deleted customer",
    contactName: contactFor.get(call.customerId) ?? "",
    startedAt: call.startedAt,
    durationSec: call.durationSec ?? 0,
    status: call.status,
    isTest: call.isTest,
    turns: call.turns ?? call.transcript.length,
  }));

  return NextResponse.json({
    kpis,
    window,
    callsPerDay: callsPerDay(calls, window),
    topCustomers,
    recentCalls,
    realCallCount: countableCalls(calls).length,
  });
}

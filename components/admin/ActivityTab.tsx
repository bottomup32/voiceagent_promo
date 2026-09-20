"use client";

import { useState } from "react";
import { PhoneCall } from "lucide-react";
import { toast } from "sonner";
import { readJson } from "@/lib/http";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Transcript } from "@/components/call/Transcript";
import { EmptyState, StatusBadge } from "@/components/admin/shared";
import { callerLines, formatDuration } from "@/lib/analytics";
import type { CallLog } from "@/lib/types";

const STATUS_KIND = {
  completed: "positive",
  started: "active",
  abandoned: "caution",
  failed: "negative",
} as const;

export function ActivityTab({
  calls,
  customerId,
  onChanged,
}: {
  calls: CallLog[];
  customerId: string;
  onChanged?: () => void;
}) {
  const [selected, setSelected] = useState<CallLog | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Calls made before the test flag was explicit were tagged from the admin
  // cookie, so trying a prospect's own link marked the call as a test and it
  // left the numbers. This puts it back.
  async function setKind(call: CallLog, isTest: boolean) {
    setBusyId(call.id);
    try {
      const response = await fetch(`/api/admin/customers/${customerId}/calls`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callId: call.id, isTest }),
      });
      await readJson<{ call: CallLog }>(response);
      toast.success(isTest ? "Counted as your test." : "Counted as a customer call.");
      onChanged?.();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not change it.");
    } finally {
      setBusyId(null);
    }
  }

  const testCount = calls.filter((call) => call.isTest).length;
  // The most useful thing in a demo is what the caller wanted, not how long
  // they stayed. Their own words, newest first, each opening the call it is from.
  const asked = callerLines(calls, 30);

  if (calls.length === 0) {
    return (
      <EmptyState
        icon={<PhoneCall className="size-6" />}
        message="No calls yet. Share the link to get started."
      />
    );
  }

  return (
    <>
      {testCount ? (
        <p className="ta-caption-1 text-muted-foreground pb-3">
          {testCount === calls.length
            ? "Every call here is marked as your own test, so none of them reach the numbers."
            : `${testCount} of these are marked as your own tests and are left out of the numbers.`}{" "}
          Switch one off if a customer made it.
        </p>
      ) : null}
      {asked.length ? (
        <section className="mb-6 space-y-2">
          <h3 className="ta-headline-2">What they asked</h3>
          <p className="ta-caption-1 text-muted-foreground">
            Every line the callers said, newest first. Click one to read the call
            it came from.
          </p>
          <ul className="max-h-64 space-y-1 overflow-y-auto pt-1">
            {asked.map((line, index) => (
              <li key={`${line.callId}-${index}`}>
                <button
                  type="button"
                  onClick={() =>
                    setSelected(calls.find((call) => call.id === line.callId) ?? null)
                  }
                  className="hover:bg-accent ta-body-2 w-full rounded-lg px-2 py-1.5 text-left"
                >
                  {line.text}
                  <span className="ta-caption-2 text-muted-foreground block">
                    {new Date(line.at).toLocaleString()}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="ta-caption-1 text-muted-foreground">Started</TableHead>
            <TableHead className="ta-caption-1 text-muted-foreground text-right">
              Duration
            </TableHead>
            <TableHead className="ta-caption-1 text-muted-foreground text-right">
              Turns
            </TableHead>
            <TableHead className="ta-caption-1 text-muted-foreground">Status</TableHead>
            <TableHead className="ta-caption-1 text-muted-foreground">Kind</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {calls.map((call) => (
            <TableRow
              key={call.id}
              className="hover:bg-accent h-11 cursor-pointer"
              onClick={() => setSelected(call)}
            >
              <TableCell className="ta-label-1">
                {new Date(call.startedAt).toLocaleString()}
              </TableCell>
              <TableCell className="ta-label-1 text-right tabular-nums">
                {formatDuration(call.durationSec)}
              </TableCell>
              <TableCell className="ta-label-1 text-right tabular-nums">
                {call.turns ?? call.transcript.length}
              </TableCell>
              <TableCell>
                <StatusBadge kind={STATUS_KIND[call.status]}>{call.status}</StatusBadge>
              </TableCell>
              <TableCell onClick={(event) => event.stopPropagation()}>
                <label className="ta-caption-1 text-muted-foreground flex items-center gap-2">
                  <Switch
                    checked={call.isTest}
                    disabled={busyId === call.id}
                    onCheckedChange={(checked) => void setKind(call, checked)}
                    aria-label={`Count this call as ${
                      call.isTest ? "a customer call" : "your test"
                    }`}
                  />
                  {call.isTest ? "Test" : "Customer"}
                </label>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent side="right" className="w-96 overflow-y-auto sm:max-w-96">
          <SheetHeader>
            <SheetTitle className="ta-headline-1">Call transcript</SheetTitle>
            <SheetDescription className="ta-caption-1">
              {selected
                ? `${new Date(selected.startedAt).toLocaleString()} · ${formatDuration(
                    selected.durationSec,
                  )}`
                : ""}
            </SheetDescription>
          </SheetHeader>
          {selected ? (
            <Transcript
              entries={selected.transcript}
              emptyMessage="This call ended before anything was said."
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}

"use client";

import { useState } from "react";
import { PhoneCall } from "lucide-react";
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
import { formatDuration } from "@/lib/analytics";
import type { CallLog } from "@/lib/types";

const STATUS_KIND = {
  completed: "positive",
  started: "active",
  abandoned: "caution",
  failed: "negative",
} as const;

export function ActivityTab({ calls }: { calls: CallLog[] }) {
  const [selected, setSelected] = useState<CallLog | null>(null);

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
              <TableCell className="ta-label-1 text-muted-foreground">
                {call.isTest ? "Test" : "Customer"}
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

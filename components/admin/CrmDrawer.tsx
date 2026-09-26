"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { CrmTab } from "@/components/admin/CrmTab";
import { PHASE_LABEL } from "@/components/admin/crm-shared";
import { readJson } from "@/lib/http";
import type {
  CallLog,
  CrmNote,
  Customer,
  CustomerPhase,
  CustomerStats,
  LifecycleEvent,
  TrackEvent,
} from "@/lib/types";

type Payload = {
  customer: Customer;
  stats: CustomerStats;
  calls: CallLog[];
  events: TrackEvent[];
  notes: CrmNote[];
  lifecycle: LifecycleEvent[];
};

/**
 * One prospect's CRM, opened from the board or the feed.
 *
 * It loads on open rather than with the page: the board needs every prospect's
 * headline numbers, and nobody needs every prospect's timeline at once. The
 * link out is deliberate — this drawer is for working the deal, and anything
 * about the demo itself belongs on the customer page.
 */
export function CrmDrawer({
  customerId,
  onClose,
  onSaved,
}: {
  customerId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!customerId) return;
    try {
      const response = await fetch(`/api/admin/customers/${customerId}`, {
        cache: "no-store",
      });
      setData(await readJson<Payload>(response));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load this prospect.");
    }
  }, [customerId]);

  useEffect(() => {
    // Clearing first stops the previous prospect's timeline showing under the
    // next one's name while the fetch is in flight.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData(null);
    setError(null);
    void load();
  }, [load]);

  async function save(partial: Partial<Customer>) {
    if (!data) return;
    setData({ ...data, customer: { ...data.customer, ...partial } });
    try {
      const response = await fetch(`/api/admin/customers/${data.customer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(partial),
      });
      const payload = await readJson<{ customer: Customer }>(response);
      setData((current) =>
        current ? { ...current, customer: payload.customer! } : current,
      );
      onSaved();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not save.");
      void load();
    }
  }

  async function movePhase(to: CustomerPhase) {
    if (!data) return;
    try {
      const response = await fetch(`/api/admin/customers/${data.customer.id}/phase`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to }),
      });
      await readJson<{ customer: Customer }>(response);
      toast.success(`Moved to ${PHASE_LABEL[to]}.`);
      void load();
      onSaved();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not move it.");
    }
  }

  const name = data?.customer.profile.name || data?.customer.businessName || "";

  return (
    <Sheet open={Boolean(customerId)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-[28rem] overflow-y-auto sm:max-w-[28rem]">
        <SheetHeader>
          <SheetTitle className="ta-headline-1">{name || "Prospect"}</SheetTitle>
          <SheetDescription className="ta-caption-1">
            {data?.customer.contactName || data?.customer.profile.address || ""}
          </SheetDescription>
        </SheetHeader>

        {error ? (
          <div className="bg-destructive/10 ta-label-1 text-destructive m-4 rounded-lg p-3">
            {error}
          </div>
        ) : null}

        <div className="space-y-4 p-4">
          {data ? (
            <>
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={<Link href={`/admin/customers/${data.customer.id}`} />}
              >
                Open the customer
                <ArrowUpRight className="size-4" aria-hidden />
              </Button>
              <CrmTab
                customer={data.customer}
                notes={data.notes ?? []}
                events={data.events ?? []}
                calls={data.calls ?? []}
                lifecycle={data.lifecycle ?? []}
                onChange={(partial) => void save(partial)}
                onNoteAdded={() => {
                  void load();
                  onSaved();
                }}
                onPhase={(to) => void movePhase(to)}
              />
            </>
          ) : error ? null : (
            <>
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-40 w-full" />
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

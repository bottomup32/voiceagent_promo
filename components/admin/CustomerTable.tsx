"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Copy, ExternalLink, Mail, MoreHorizontal, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, StatusBadge, statusKind } from "@/components/admin/shared";
import { isResearchStalled } from "@/lib/analytics";
import { customerLink, emailBody, emailSubject } from "@/lib/share";
import type { CustomerWithStats } from "@/lib/types";

type Props = {
  customers: CustomerWithStats[];
  onChanged: () => void;
};

const STATUS_LABELS: Record<string, string> = {
  all: "All statuses",
  ready: "Ready",
  researching: "Researching",
  error: "Error",
};

function relative(iso?: string): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function CustomerTable({ customers, onChanged }: Props) {
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [pendingDelete, setPendingDelete] = useState<CustomerWithStats | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const term = query.trim().toLowerCase();
    return customers.filter((customer) => {
      if (status !== "all" && customer.status !== status) return false;
      if (!term) return true;
      return [
        customer.profile.name,
        customer.label,
        customer.contactName,
        customer.contactEmail,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(term));
    });
  }, [customers, query, status]);

  async function toggleActive(customer: CustomerWithStats, active: boolean) {
    setBusyId(customer.id);
    try {
      await fetch(`/api/admin/customers/${customer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      toast.success(active ? "Demo is live." : "Demo is paused.");
      onChanged();
    } finally {
      setBusyId(null);
    }
  }

  async function remove(customer: CustomerWithStats) {
    await fetch(`/api/admin/customers/${customer.id}`, { method: "DELETE" });
    toast.success("Customer removed.");
    setPendingDelete(null);
    onChanged();
  }

  function copyLink(customer: CustomerWithStats) {
    void navigator.clipboard.writeText(customerLink(customer.id));
    toast.success("Link copied.");
  }

  function copyEmail(customer: CustomerWithStats) {
    const text = `${emailSubject(customer.profile.name)}\n\n${emailBody(
      customer.profile.name,
      customer.contactName,
      customerLink(customer.id),
    )}`;
    void navigator.clipboard.writeText(text);
    toast.success("Email copied.");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search business or contact"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="max-w-64"
          aria-label="Search customers"
        />
        <Select value={status} onValueChange={(value) => setStatus(value ?? "all")}>
          <SelectTrigger className="w-40" aria-label="Filter by status">
            <SelectValue>{STATUS_LABELS[status]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="ready">Ready</SelectItem>
            <SelectItem value="researching">Researching</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </SelectContent>
        </Select>
        {query || status !== "all" ? (
          <Button
            variant="ghost"
            onClick={() => {
              setQuery("");
              setStatus("all");
            }}
          >
            Reset
          </Button>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Users className="size-6" />}
          message={
            customers.length
              ? "No customers match this filter."
              : "No customers yet. Add your first customer to get started."
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="ta-caption-1 text-muted-foreground">Business</TableHead>
              <TableHead className="ta-caption-1 text-muted-foreground">Contact</TableHead>
              <TableHead className="ta-caption-1 text-muted-foreground">Status</TableHead>
              <TableHead className="ta-caption-1 text-muted-foreground">Live</TableHead>
              <TableHead className="ta-caption-1 text-muted-foreground text-right">
                Views
              </TableHead>
              <TableHead className="ta-caption-1 text-muted-foreground text-right">
                Calls
              </TableHead>
              <TableHead className="ta-caption-1 text-muted-foreground text-right">
                Minutes
              </TableHead>
              <TableHead className="ta-caption-1 text-muted-foreground hidden xl:table-cell">
                Last call
              </TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((customer) => (
              <TableRow key={customer.id} className="hover:bg-accent h-11">
                <TableCell className="ta-label-1">
                  <Link
                    href={`/admin/customers/${customer.id}`}
                    className="hover:underline"
                  >
                    {customer.profile.name || "Unnamed"}
                  </Link>
                  {customer.label ? (
                    <span className="ta-caption-1 text-muted-foreground block">
                      {customer.label}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="ta-label-1">
                  {customer.contactName || "—"}
                  {customer.contactEmail ? (
                    <span className="ta-caption-1 text-muted-foreground block">
                      {customer.contactEmail}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell>
                  <StatusBadge
                    kind={
                      isResearchStalled(customer)
                        ? "negative"
                        : statusKind(customer.status)
                    }
                  >
                    {customer.status === "ready"
                      ? "Ready"
                      : customer.status === "error"
                        ? "Error"
                        : isResearchStalled(customer)
                          ? "Stalled"
                          : "Researching"}
                  </StatusBadge>
                </TableCell>
                <TableCell>
                  <Switch
                    checked={customer.active}
                    disabled={busyId === customer.id}
                    onCheckedChange={(checked) => toggleActive(customer, checked)}
                    aria-label={`Toggle the demo for ${customer.profile.name}`}
                  />
                </TableCell>
                <TableCell className="ta-label-1 text-right tabular-nums">
                  {customer.stats.views}
                </TableCell>
                <TableCell className="ta-label-1 text-right tabular-nums">
                  {customer.stats.calls}
                </TableCell>
                <TableCell className="ta-label-1 text-right tabular-nums">
                  {Math.round((customer.stats.totalSec / 60) * 10) / 10}
                </TableCell>
                <TableCell className="ta-label-1 hidden xl:table-cell">
                  {relative(customer.stats.lastCallAt)}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button variant="ghost" size="icon" aria-label="More actions">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      }
                    />
                    <DropdownMenuContent align="end" className="rounded-lg">
                      <DropdownMenuItem
                        render={<Link href={`/admin/customers/${customer.id}`} />}
                      >
                        Open
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => copyLink(customer)}>
                        <Copy className="size-4" />
                        Copy link
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => copyEmail(customer)}>
                        <Mail className="size-4" />
                        Copy email
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        render={
                          <a
                            href={customerLink(customer.id)}
                            target="_blank"
                            rel="noreferrer"
                          />
                        }
                      >
                        <ExternalLink className="size-4" />
                        Open demo
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => setPendingDelete(customer)}
                      >
                        <Trash2 className="size-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="ta-headline-1">Delete customer</DialogTitle>
            <DialogDescription className="ta-body-2">
              This removes {pendingDelete?.profile.name} and{" "}
              {pendingDelete?.stats.calls ?? 0} call logs. The demo link stops working.
              This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => pendingDelete && remove(pendingDelete)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

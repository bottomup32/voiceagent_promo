"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function NewCustomerDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    mapsUrl: "",
    label: "",
    contactName: "",
    contactEmail: "",
    agentName: "Alex",
  });

  function update(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not add the customer.");
      toast.success("Customer added. Research is running.");
      setOpen(false);
      setForm({ mapsUrl: "", label: "", contactName: "", contactEmail: "", agentName: "Alex" });
      onCreated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add the customer.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button>
            <Plus className="size-4" />
            New customer
          </Button>
        }
      />
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="ta-headline-1">New customer</DialogTitle>
          <DialogDescription className="ta-caption-1">
            Paste the Google Maps link. Research runs in the background and builds the
            receptionist prompt.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="mapsUrl" className="ta-label-1">
              Google Maps link
            </Label>
            <Input
              id="mapsUrl"
              placeholder="https://maps.app.goo.gl/..."
              value={form.mapsUrl}
              onChange={(event) => update("mapsUrl", event.target.value)}
              aria-invalid={Boolean(error)}
              required
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="contactName" className="ta-label-1">
                Contact name
              </Label>
              <Input
                id="contactName"
                value={form.contactName}
                onChange={(event) => update("contactName", event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contactEmail" className="ta-label-1">
                Contact email
              </Label>
              <Input
                id="contactEmail"
                type="email"
                value={form.contactEmail}
                onChange={(event) => update("contactEmail", event.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="agentName" className="ta-label-1">
                Receptionist name
              </Label>
              <Input
                id="agentName"
                value={form.agentName}
                onChange={(event) => update("agentName", event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="label" className="ta-label-1">
                Label
              </Label>
              <Input
                id="label"
                placeholder="Optional note"
                value={form.label}
                onChange={(event) => update("label", event.target.value)}
              />
            </div>
          </div>
          {error ? (
            <p className="ta-caption-1 text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !form.mapsUrl}>
              {busy ? "Adding" : "Add customer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

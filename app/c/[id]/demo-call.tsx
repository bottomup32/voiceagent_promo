"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MapPin, Phone } from "lucide-react";
import { toast } from "sonner";
import { CallPanel } from "@/components/call/CallPanel";
import { Transcript } from "@/components/call/Transcript";
import { BusinessKnowledge } from "@/components/public/BusinessKnowledge";
import { PromptView } from "@/components/public/PromptView";
import { ContactButtons } from "@/components/public/ContactButtons";
import { ScenarioTeaser } from "@/components/public/ScenarioTeaser";
import { SourcesPanel } from "@/components/research/SourcesPanel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VersionBadge } from "@/components/VersionBadge";
import { useLiveCall } from "@/hooks/useLiveCall";
import { formatDuration, type DemoAllowance } from "@/lib/analytics";
import { CONTACT_URL, mailtoFor } from "@/lib/links";
import { SCENARIO_COUNT } from "@/lib/use-cases";
import type {
  BusinessProfile,
  CallSound,
  CustomerPrompts,
  ResearchSource,
} from "@/lib/types";

type DemoCallProps = {
  customerId: string;
  callSound: CallSound;
  name: string;
  category?: string;
  address?: string;
  phone?: string;
  agentName: string;
  voiceLabel: string;
  profile: BusinessProfile;
  prompts: Pick<CustomerPrompts, "live" | "backend" | "greeting">;
  dossier: string;
  sources: ResearchSource[];
  researchedAt?: string;
  demo: DemoAllowance;
  demoUrl: string;
};

export function DemoCall({
  customerId,
  name,
  category,
  address,
  phone,
  agentName,
  callSound,
  voiceLabel,
  profile,
  prompts,
  dossier,
  sources,
  researchedAt,
  demo,
  demoUrl,
}: DemoCallProps) {
  const call = useLiveCall(customerId, callSound);
  const tracked = useRef(false);
  const [allowance, setAllowance] = useState(demo);

  // Built from the link the server knows. Reading window.location here would
  // render empty on the server and hydration would keep the empty href.
  const mailto = mailtoFor(name, demoUrl);

  useEffect(() => {
    if (tracked.current) return;
    tracked.current = true;
    void fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId, event: "page_view" }),
    }).catch(() => undefined);
  }, [customerId]);

  // The server owns the running total, so ask it again once a call is over
  // rather than guessing from the local timer.
  useEffect(() => {
    if (call.state !== "ended") return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/customers/${customerId}/public`, {
          cache: "no-store",
        });
        if (!response.ok) return;
        const data = (await response.json()) as { demo?: DemoAllowance };
        if (!cancelled && data.demo) setAllowance(data.demo);
      } catch {
        // The number on screen stays as it was; the next call is the check.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [call.state, customerId]);

  const askForChange = useCallback(() => {
    toast("Editing is off while this is a demo.", {
      description: `Tell us what to change and ${agentName} answers that way on the next call.`,
      action: {
        label: "Talk to us",
        onClick: () => window.open(CONTACT_URL, "_blank", "noreferrer"),
      },
    });
  }, [agentName]);

  const exhausted = allowance.exhausted;
  const remaining = Math.max(0, allowance.remainingSec - (call.usageSec || 0));

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-1">
        <span className="ta-headline-2">TecAce</span>
        <span className="ta-caption-1 text-muted-foreground">
          AI voice agent demo
        </span>
      </header>

      <Card className="border-primary/30 bg-primary/5 rounded-xl border shadow-none">
        <CardContent className="space-y-3 p-4 md:p-6">
          <p className="ta-headline-2">This is a demo, not your phone line.</p>
          <p className="ta-body-2-reading text-muted-foreground">
            Nobody at {name} set this up. We researched the business from public
            sources and built a receptionist from what we found, so you can hear
            what your callers would hear. When you want it answering your real
            number, that part is a conversation with us.
          </p>
          <ContactButtons mailto={mailto} />
        </CardContent>
      </Card>

      <Card className="rounded-xl border shadow-none">
        <CardHeader className="gap-2 text-center">
          <CardTitle className="ta-title-3">{name}</CardTitle>
          {category ? (
            <p className="ta-label-1 text-muted-foreground">{category}</p>
          ) : null}
          <div className="flex flex-col items-center gap-1 pt-1">
            {address ? (
              <span className="ta-caption-1 flex items-center gap-1.5 text-muted-foreground">
                <MapPin className="size-3.5" aria-hidden />
                {address}
              </span>
            ) : null}
            {phone ? (
              <span className="ta-caption-1 flex items-center gap-1.5 text-muted-foreground">
                <Phone className="size-3.5" aria-hidden />
                {phone}
              </span>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pb-8">
          {exhausted ? null : (
            <CallPanel
              state={call.state}
              elapsedSec={call.elapsedSec}
              usageSec={call.usageSec}
              muted={call.muted}
              error={call.error}
              onDial={call.dial}
              onHangup={call.hangup}
              onToggleMute={call.toggleMute}
              onReset={call.reset}
            />
          )}

          {exhausted ? (
            <div className="border-primary/30 bg-primary/5 space-y-3 rounded-lg border p-4 text-center">
              <p className="ta-label-1">
                That is the {Math.round(allowance.allowedSec / 60)} minutes this
                demo comes with.
              </p>
              <p className="ta-caption-1 text-muted-foreground">
                Ask us for more and we will open it back up — or skip ahead and
                talk about putting {agentName} on your real line.
              </p>
              <div className="flex justify-center">
                <ContactButtons mailto={mailto} />
              </div>
            </div>
          ) : (
            <p className="ta-caption-1 text-muted-foreground text-center">
              {formatDuration(remaining)} of demo time left, of{" "}
              {Math.round(allowance.allowedSec / 60)} minutes. Need more? Just ask
              us.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="flex min-h-72 flex-col overflow-hidden rounded-xl border shadow-none">
        <CardHeader className="pb-0">
          <CardTitle className="ta-headline-2">Transcript</CardTitle>
        </CardHeader>
        <CardContent className="max-h-96 flex-1 overflow-y-auto p-0">
          <Transcript
            entries={call.transcript}
            thinking={call.thinking}
            emptyMessage={
              exhausted
                ? `The demo time for ${name} is used up. Ask us for more.`
                : `Press call to talk to ${agentName} at ${name}.`
            }
          />
        </CardContent>
      </Card>

      <ScenarioTeaser customerId={customerId} count={SCENARIO_COUNT} />

      <Card className="rounded-xl border shadow-none">
        <CardHeader>
          <CardTitle className="ta-headline-2">How it was built</CardTitle>
          <p className="ta-caption-1 text-muted-foreground">
            Nobody typed any of this in. We researched {name} from public sources,
            turned what we found into a profile, and generated the instructions the
            receptionist runs on. Everything here is yours to correct before launch.
          </p>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="knowledge">
            <TabsList variant="line" className="w-full justify-start">
              <TabsTrigger value="knowledge">Knowledge</TabsTrigger>
              <TabsTrigger value="prompt">Prompt</TabsTrigger>
              <TabsTrigger value="sources">Sources</TabsTrigger>
            </TabsList>

            <TabsContent value="knowledge" className="pt-4">
              <BusinessKnowledge profile={profile} onEditAttempt={askForChange} />
            </TabsContent>

            <TabsContent value="prompt" className="pt-4">
              <PromptView
                prompts={prompts}
                voiceLabel={voiceLabel}
                agentName={agentName}
              />
            </TabsContent>

            <TabsContent value="sources" className="pt-4">
              <SourcesPanel
                dossier={dossier}
                sources={sources}
                researchedAt={researchedAt}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card className="rounded-xl border shadow-none">
        <CardContent className="space-y-3 p-4 text-center md:p-6">
          <p className="ta-headline-2">Want this answering your real calls?</p>
          <p className="ta-body-2-reading text-muted-foreground">
            Same receptionist, your number, your hours, your booking rules — and
            the knowledge above becomes yours to edit. The reservations,
            confirmation calls, voicemail and transfers are the same system,
            turned on.
          </p>
          <div className="flex justify-center">
            <ContactButtons mailto={mailto} />
          </div>
        </CardContent>
      </Card>

      <footer className="flex flex-col items-center gap-1 pb-4">
        <p className="ta-caption-1 text-muted-foreground text-center">
          A TecAce demo. The business shown here has not endorsed it.
        </p>
        <p className="ta-caption-2 text-muted-foreground max-w-md text-center">
          So we can see how the demo went, this page counts visits and keeps
          what was said on the call. Nothing is shared outside TecAce.
        </p>
        <VersionBadge />
      </footer>
    </main>
  );
}

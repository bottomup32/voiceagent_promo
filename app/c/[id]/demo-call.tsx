"use client";

import { useEffect, useRef } from "react";
import { MapPin, Phone } from "lucide-react";
import { CallPanel } from "@/components/call/CallPanel";
import { Transcript } from "@/components/call/Transcript";
import { BusinessKnowledge } from "@/components/public/BusinessKnowledge";
import { PromptView } from "@/components/public/PromptView";
import { SourcesPanel } from "@/components/research/SourcesPanel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLiveCall } from "@/hooks/useLiveCall";
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
}: DemoCallProps) {
  const call = useLiveCall(customerId, callSound);
  const tracked = useRef(false);

  useEffect(() => {
    if (tracked.current) return;
    tracked.current = true;
    void fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId, event: "page_view" }),
    }).catch(() => undefined);
  }, [customerId]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-1">
        <span className="ta-headline-2">TecAce</span>
        <span className="ta-caption-1 text-muted-foreground">
          AI receptionist demo
        </span>
      </header>

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
        <CardContent className="pb-8">
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
            emptyMessage={`Press call to talk to ${agentName} at ${name}.`}
          />
        </CardContent>
      </Card>

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
              <BusinessKnowledge profile={profile} />
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

      <p className="ta-caption-1 text-muted-foreground pb-4 text-center">
        This page is a preview. Ask us for a change and it goes live on the next
        call.
      </p>
    </main>
  );
}

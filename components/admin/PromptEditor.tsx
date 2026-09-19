"use client";

import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { LIVE_VOICES, type CustomerPrompts } from "@/lib/types";

type Props = {
  agentName: string;
  voice: string;
  prompts: CustomerPrompts;
  onAgentNameChange: (value: string) => void;
  onVoiceChange: (value: string) => void;
  onPromptsChange: (prompts: CustomerPrompts) => void;
  onRegenerate: () => void;
  regenerating: boolean;
};

function PromptField({
  id,
  label,
  description,
  value,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="ta-label-1">
        {label}
      </Label>
      <p className="ta-caption-1 text-muted-foreground">{description}</p>
      <Textarea
        id={id}
        className="min-h-48 font-mono text-[13px] leading-5"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <p className="ta-caption-1 text-muted-foreground">
        {value.length} characters
      </p>
    </div>
  );
}

export function PromptEditor({
  agentName,
  voice,
  prompts,
  onAgentNameChange,
  onVoiceChange,
  onPromptsChange,
  onRegenerate,
  regenerating,
}: Props) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="agentName" className="ta-label-1">
            Receptionist name
          </Label>
          <Input
            id="agentName"
            value={agentName}
            onChange={(event) => onAgentNameChange(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="voice" className="ta-label-1">
            Voice
          </Label>
          <Select value={voice} onValueChange={(value) => onVoiceChange(value ?? voice)}>
            <SelectTrigger id="voice">
              <SelectValue>{voice}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {LIVE_VOICES.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end">
          <Button variant="outline" onClick={onRegenerate} disabled={regenerating}>
            <RefreshCw className="size-4" />
            {regenerating ? "Rebuilding" : "Rebuild from data"}
          </Button>
        </div>
      </div>

      {prompts.edited ? (
        <div className="bg-primary/10 ta-caption-1 text-primary rounded-lg p-3">
          These prompts were edited by hand. Re-research keeps them unless you rebuild.
        </div>
      ) : null}

      <PromptField
        id="prompt-live"
        label="Voice prompt"
        description="Runs on GPT-Live. Keep it about manner, pace, and the facts worth answering instantly."
        value={prompts.live}
        onChange={(live) => onPromptsChange({ ...prompts, live, edited: true })}
      />
      <PromptField
        id="prompt-backend"
        label="Backend prompt"
        description="Runs on the delegated model. Holds the full profile and the rules for looking things up."
        value={prompts.backend}
        onChange={(backend) => onPromptsChange({ ...prompts, backend, edited: true })}
      />
      <PromptField
        id="prompt-greeting"
        label="Greeting"
        description="Sent once the session starts, so the receptionist speaks first."
        value={prompts.greeting}
        onChange={(greeting) => onPromptsChange({ ...prompts, greeting, edited: true })}
      />
    </div>
  );
}

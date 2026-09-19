"use client";

import { Mic, MicOff, Phone, PhoneOff, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/analytics";
import type { CallState } from "@/lib/types";

type CallPanelProps = {
  state: CallState;
  elapsedSec: number;
  usageSec: number;
  muted: boolean;
  error: string | null;
  disabled?: boolean;
  compact?: boolean;
  onDial: () => void;
  onHangup: () => void;
  onToggleMute: () => void;
  onReset: () => void;
};

const STATUS_TEXT: Record<CallState, string> = {
  idle: "Ready to call",
  connecting: "Connecting",
  ringing: "Ringing",
  connected: "Connected",
  ending: "Hanging up",
  ended: "Call ended",
  error: "Call failed",
};

export function CallPanel({
  state,
  elapsedSec,
  usageSec,
  muted,
  error,
  disabled,
  compact,
  onDial,
  onHangup,
  onToggleMute,
  onReset,
}: CallPanelProps) {
  const inCall = state === "ringing" || state === "connected" || state === "ending";
  const busy = state === "connecting" || state === "ending";
  const duration = state === "ended" ? usageSec || elapsedSec : elapsedSec;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex items-center gap-3">
        <span
          className={`size-2 rounded-full ${
            state === "connected"
              ? "bg-success"
              : state === "error"
                ? "bg-destructive"
                : inCall
                  ? "bg-warning"
                  : "bg-muted-foreground/40"
          }`}
          aria-hidden
        />
        <span className="ta-label-1 text-muted-foreground">
          {STATUS_TEXT[state]}
          {(state === "connected" || state === "ended") && duration > 0
            ? ` · ${formatDuration(duration)}`
            : ""}
        </span>
      </div>

      <div className="flex items-center gap-3">
        {inCall ? (
          <Button
            variant="destructive"
            size="lg"
            className={compact ? "h-12 px-6" : "h-16 px-10"}
            onClick={onHangup}
            disabled={state === "ending"}
            aria-label="End the call"
          >
            <PhoneOff className="size-5" />
            End call
          </Button>
        ) : (
          <Button
            size="lg"
            className={compact ? "h-12 px-6" : "h-16 px-10"}
            onClick={state === "ended" || state === "error" ? onReset : onDial}
            disabled={disabled || busy}
            aria-label={state === "ended" || state === "error" ? "Start a new call" : "Call now"}
          >
            {state === "ended" || state === "error" ? (
              <>
                <RotateCcw className="size-5" />
                Call again
              </>
            ) : (
              <>
                <Phone className="size-5" />
                {busy ? "Calling" : "Call now"}
              </>
            )}
          </Button>
        )}

        {inCall ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-12"
            onClick={onToggleMute}
            aria-label={muted ? "Unmute the microphone" : "Mute the microphone"}
          >
            {muted ? <MicOff className="size-5" /> : <Mic className="size-5" />}
          </Button>
        ) : null}
      </div>

      {error ? (
        <p className="ta-caption-1 max-w-sm text-center text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Ringtone } from "@/lib/ringtone";
import { appendFragment } from "@/lib/transcript";
import type { CallState, TranscriptEntry } from "@/lib/types";

type LiveEvent = {
  type: string;
  delta?: string;
  start_ms?: number;
  end_ms?: number;
  usage?: { seconds?: number };
  error?: { message?: string };
  reason?: string;
  delegation?: { id?: string };
};

const ICE_TIMEOUT_MS = 2000;
const CLOSE_TIMEOUT_MS = 5000;

async function waitForIceGathering(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === "complete") return;
  await new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      pc.removeEventListener("icegatheringstatechange", onChange);
      resolve();
    };
    const onChange = () => {
      if (pc.iceGatheringState === "complete") done();
    };
    const timer = setTimeout(done, ICE_TIMEOUT_MS);
    pc.addEventListener("icegatheringstatechange", onChange);
  });
}

export type UseLiveCall = {
  state: CallState;
  transcript: TranscriptEntry[];
  elapsedSec: number;
  usageSec: number;
  muted: boolean;
  thinking: boolean;
  error: string | null;
  dial: () => Promise<void>;
  hangup: () => void;
  toggleMute: () => void;
  reset: () => void;
};

export function useLiveCall(customerId: string): UseLiveCall {
  const [state, setState] = useState<CallState>("idle");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [usageSec, setUsageSec] = useState(0);
  const [muted, setMuted] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ringtoneRef = useRef<Ringtone | null>(null);
  const callIdRef = useRef<string | null>(null);
  const transcriptRef = useRef<TranscriptEntry[]>([]);
  const usageRef = useRef(0);
  const startedAtRef = useRef(0);
  const reportedRef = useRef(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopRingtone = useCallback(() => {
    ringtoneRef.current?.stop();
    ringtoneRef.current = null;
  }, []);

  const teardown = useCallback(() => {
    stopRingtone();
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    dcRef.current?.close();
    dcRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (audioRef.current) {
      audioRef.current.srcObject = null;
      audioRef.current.remove();
      audioRef.current = null;
    }
  }, [stopRingtone]);

  const report = useCallback(
    (status: "completed" | "failed" | "abandoned", endReason?: string, beacon = false) => {
      const callId = callIdRef.current;
      if (!callId || reportedRef.current) return;
      reportedRef.current = true;

      const durationSec =
        usageRef.current ||
        (startedAtRef.current ? Math.round((Date.now() - startedAtRef.current) / 1000) : 0);
      const payload = JSON.stringify({
        status,
        durationSec,
        endReason,
        transcript: transcriptRef.current,
      });
      const url = `/api/calls/${callId}`;

      if (beacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([payload], { type: "application/json" }));
        return;
      }
      void fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => undefined);
    },
    [],
  );

  const finish = useCallback(
    (status: "completed" | "failed" | "abandoned", endReason?: string) => {
      report(status, endReason);
      teardown();
      setThinking(false);
      setState(status === "failed" ? "error" : "ended");
    },
    [report, teardown],
  );

  const send = useCallback((event: Record<string, unknown>) => {
    const dc = dcRef.current;
    if (dc?.readyState === "open") dc.send(JSON.stringify(event));
  }, []);

  const handleEvent = useCallback(
    (event: LiveEvent, greeting: string) => {
      switch (event.type) {
        case "session.started": {
          stopRingtone();
          startedAtRef.current = Date.now();
          setState("connected");
          tickRef.current = setInterval(() => {
            setElapsedSec(Math.round((Date.now() - startedAtRef.current) / 1000));
          }, 1000);
          send({
            type: "session.instructions.append",
            event_id: `greet_${Date.now()}`,
            delegation_id: null,
            content: greeting,
          });
          break;
        }
        case "session.input_transcript.delta":
        case "session.output_transcript.delta": {
          if (!event.delta) break;
          const speaker =
            event.type === "session.input_transcript.delta" ? "caller" : "receptionist";
          if (speaker === "receptionist") setThinking(false);
          const next = appendFragment(transcriptRef.current, {
            speaker,
            delta: event.delta,
            startMs: event.start_ms ?? 0,
            endMs: event.end_ms ?? event.start_ms ?? 0,
          });
          transcriptRef.current = next;
          setTranscript(next);
          break;
        }
        case "session.delegation.created":
          setThinking(true);
          break;
        case "session.usage.updated":
          if (typeof event.usage?.seconds === "number") {
            usageRef.current = event.usage.seconds;
            setUsageSec(event.usage.seconds);
          }
          break;
        case "session.closed":
          if (typeof event.usage?.seconds === "number") {
            usageRef.current = event.usage.seconds;
            setUsageSec(event.usage.seconds);
          }
          finish("completed", event.reason);
          break;
        case "error":
          setError(event.error?.message ?? "The call ran into an error.");
          finish("failed", event.error?.message);
          break;
        default:
          break;
      }
    },
    [finish, send, stopRingtone],
  );

  const dial = useCallback(async () => {
    if (state === "connecting" || state === "ringing" || state === "connected") return;

    setError(null);
    setTranscript([]);
    transcriptRef.current = [];
    usageRef.current = 0;
    setUsageSec(0);
    setElapsedSec(0);
    setMuted(false);
    reportedRef.current = false;
    callIdRef.current = null;
    setState("connecting");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      const audio = document.createElement("audio");
      audio.autoplay = true;
      audioRef.current = audio;
      pc.addEventListener("track", (event) => {
        audio.srcObject = event.streams[0] ?? new MediaStream([event.track]);
        void audio.play().catch(() => undefined);
      });

      for (const track of stream.getAudioTracks()) pc.addTrack(track, stream);

      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIceGathering(pc);

      setState("ringing");
      ringtoneRef.current = new Ringtone();
      void ringtoneRef.current.start();

      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId, sdp: pc.localDescription?.sdp }),
      });

      const data = (await response.json()) as {
        callId?: string;
        sdp?: string;
        greeting?: string;
        error?: string;
      };

      if (!response.ok || !data.sdp) {
        throw new Error(data.error || "Could not start the call.");
      }

      callIdRef.current = data.callId ?? null;
      const greeting = data.greeting ?? "Greet the caller now, then pause and listen.";
      dc.addEventListener("message", (event) => {
        try {
          handleEvent(JSON.parse(event.data) as LiveEvent, greeting);
        } catch {
          // Ignore frames that are not JSON.
        }
      });

      await pc.setRemoteDescription({ type: "answer", sdp: data.sdp });
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Could not start the call.";
      setError(
        message.includes("Permission denied") || message.includes("NotAllowed")
          ? "Microphone access is needed to make the call."
          : message,
      );
      stopRingtone();
      if (callIdRef.current) {
        finish("failed", message);
      } else {
        teardown();
        setState("error");
      }
    }
  }, [customerId, finish, handleEvent, state, stopRingtone, teardown]);

  const hangup = useCallback(() => {
    if (state !== "connected" && state !== "ringing") return;
    setState("ending");
    stopRingtone();
    send({ type: "session.close", event_id: `close_${Date.now()}` });
    closeTimerRef.current = setTimeout(() => {
      finish("completed", "close_timeout");
    }, CLOSE_TIMEOUT_MS);
  }, [finish, send, state, stopRingtone]);

  const toggleMute = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    const next = !muted;
    stream.getAudioTracks().forEach((track) => {
      track.enabled = !next;
    });
    send({
      type: next ? "session.input_audio.mute" : "session.input_audio.unmute",
      event_id: `mute_${Date.now()}`,
    });
    setMuted(next);
  }, [muted, send]);

  const reset = useCallback(() => {
    teardown();
    transcriptRef.current = [];
    setTranscript([]);
    setState("idle");
    setError(null);
    setElapsedSec(0);
    setUsageSec(0);
    setThinking(false);
  }, [teardown]);

  useEffect(() => {
    const onLeave = () => {
      if (pcRef.current) {
        report("abandoned", "page_hidden", true);
        teardown();
      }
    };
    window.addEventListener("pagehide", onLeave);
    return () => {
      window.removeEventListener("pagehide", onLeave);
      onLeave();
    };
  }, [report, teardown]);

  return {
    state,
    transcript,
    elapsedSec,
    usageSec,
    muted,
    thinking,
    error,
    dial,
    hangup,
    toggleMute,
    reset,
  };
}

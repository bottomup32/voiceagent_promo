"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { CallMeters } from "@/lib/call-audio";
import { follow, levelFromSamples } from "@/lib/voice-level";
import type { CallState } from "@/lib/types";

type Props = {
  state: CallState;
  /** From useLiveCall. Without it the orb only breathes. */
  meters?: RefObject<CallMeters>;
  /** Diameter in CSS pixels. */
  size?: number;
  className?: string;
};

/** How the wave behaves at rest and at full voice. */
const ORB = {
  /** Radians per second the wave drifts when nobody is talking… */
  idleSpeed: 0.9,
  /** …and how much faster at full level. */
  speedGain: 5,
  /** Wave height as a fraction of the radius, at rest and at full level. */
  idleAmplitude: 0.08,
  amplitudeGain: 0.5,
  /** Three sines at different cycles across the circle, so the layers never line up. */
  layers: [
    { cycles: 1.7, phase: 0, alpha: 0.85 },
    { cycles: 2.4, phase: 1.4, alpha: 0.5 },
    { cycles: 3.1, phase: 2.9, alpha: 0.28 },
  ],
} as const;

const LIVE = new Set<CallState>(["ringing", "connected", "ending"]);

/** The brand blue as r,g,b from the token, so the canvas follows the theme. */
function readAccent(element: Element): string {
  const raw = getComputedStyle(element).getPropertyValue("--primary").trim();
  const hex = /^#([0-9a-f]{6})$/i.exec(raw)?.[1];
  if (!hex) return "17,109,255";
  const n = parseInt(hex, 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

/**
 * A circle with a wave moving inside it: slow while the line is quiet, fast
 * and tall while someone is talking. It listens to the same analysers the
 * call uses, so the movement is the sound, not a guess about it. Decorative;
 * the status text next to it carries the meaning.
 */
export function VoiceOrb({ state, meters, size = 40, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // The frame loop reads the latest state without restarting on every change.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const accent = readAccent(canvas);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const radius = size / 2;
    const samples = new Float32Array(256);

    let env = 0;
    let phase = 0;
    let last = performance.now();
    let frame = 0;

    const level = () => {
      const m = meters?.current;
      if (!m || !LIVE.has(stateRef.current)) return 0;
      let peak = 0;
      for (const node of [m.input, m.output]) {
        if (!node) continue;
        node.getFloatTimeDomainData(samples);
        peak = Math.max(peak, levelFromSamples(samples));
      }
      return peak;
    };

    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      const current = stateRef.current;
      env = follow(env, level());
      phase += dt * (ORB.idleSpeed + env * ORB.speedGain);
      const amplitude = radius * (ORB.idleAmplitude + env * ORB.amplitudeGain);
      const dim = current === "error" || current === "ended" || current === "idle";

      ctx.clearRect(0, 0, size, size);

      // The disc.
      ctx.beginPath();
      ctx.arc(radius, radius, radius - 0.75, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${accent},${dim ? 0.06 : 0.1 + env * 0.1})`;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(${accent},${dim ? 0.28 : 0.4 + env * 0.4})`;
      ctx.stroke();

      // The waves, clipped to the disc.
      ctx.save();
      ctx.beginPath();
      ctx.arc(radius, radius, radius - 1.5, 0, Math.PI * 2);
      ctx.clip();
      ctx.lineWidth = 1.5;
      ctx.lineCap = "round";
      for (const layer of ORB.layers) {
        ctx.beginPath();
        for (let x = 0; x <= size; x += 1) {
          const t = x / size;
          // A window so each wave fades to the disc's edge instead of hitting it.
          const window = Math.sin(t * Math.PI);
          const y =
            radius +
            Math.sin(t * Math.PI * 2 * layer.cycles + phase + layer.phase) * amplitude * window;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(${accent},${dim ? layer.alpha * 0.65 : layer.alpha})`;
        ctx.stroke();
      }
      ctx.restore();

      if (!reduceMotion) frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [meters, size]);

  return (
    <canvas
      ref={canvasRef}
      className={`shrink-0 ${className ?? ""}`}
      style={{ width: size, height: size }}
      aria-hidden
    />
  );
}

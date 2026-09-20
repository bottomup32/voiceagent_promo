import type { CallSound } from "./types";
import { DEFAULT_CALL_SOUND } from "./types";

/**
 * Makes the call sound like a phone call rather than a studio recording:
 * the agent's voice is narrowed to the telephone band, and a quiet room tone
 * plays underneath. Both parts are optional and tuned to stay subtle.
 *
 * The same graph carries two analysers — one on the microphone, one on the
 * agent's voice — so the page can draw who is talking without a second
 * audio context.
 */

export const PHONE_BAND = {
  /** Real phone lines roll off below this. */
  highpassHz: 220,
  /** ...and above this. */
  lowpassHz: 3600,
  /** A small lift where speech sits, so the narrowed band still cuts through. */
  presenceHz: 2000,
  presenceGainDb: 3,
  /** Make up for the energy the filters remove. */
  outputGain: 1.25,
} as const;

export const ROOM_TONE = {
  /** Quiet enough to feel like a room, not like static. */
  gain: 0.008,
  /** The tone sits low and dull, like air handling and distant activity. */
  bandpassHz: 480,
  bandpassQ: 0.7,
  lowpassHz: 1800,
  /** Slow drift so the noise floor never sounds frozen. */
  driftHz: 0.07,
  driftDepth: 0.35,
  /** Seconds of noise generated before looping. */
  loopSeconds: 4,
} as const;

/** Small enough to read at 60 fps without lag, large enough to average a syllable. */
const METER_FFT = 512;

export function resolveCallSound(sound?: Partial<CallSound> | null): CallSound {
  return {
    phoneLine: sound?.phoneLine ?? DEFAULT_CALL_SOUND.phoneLine,
    roomTone: sound?.roomTone ?? DEFAULT_CALL_SOUND.roomTone,
  };
}

/** Pink-ish noise: white noise run through a simple one-pole low-pass. */
export function fillRoomToneBuffer(channel: Float32Array, random = Math.random): void {
  let last = 0;
  for (let i = 0; i < channel.length; i++) {
    const white = random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    channel[i] = last * 3.5;
  }
}

/** The two things the orb listens to. Either is null until its stream arrives, or forever without Web Audio. */
export type CallMeters = {
  input: AnalyserNode | null;
  output: AnalyserNode | null;
};

type Ctor = typeof AudioContext;

function audioContextCtor(): Ctor | undefined {
  if (typeof window === "undefined") return undefined;
  return (
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext
  );
}

export class CallAudio {
  private context: AudioContext | null = null;
  private element: HTMLAudioElement | null = null;
  private roomToneSource: AudioBufferSourceNode | null = null;
  private roomToneGain: GainNode | null = null;
  private drift: OscillatorNode | null = null;
  private inputSource: MediaStreamAudioSourceNode | null = null;

  readonly meters: CallMeters = { input: null, output: null };

  private ensureContext(): AudioContext | null {
    if (this.context) return this.context;
    const Ctor = audioContextCtor();
    if (!Ctor) return null;
    try {
      const context = new Ctor();
      this.context = context;
      void context.resume().catch(() => undefined);
      return context;
    } catch {
      return null;
    }
  }

  private analyser(context: AudioContext): AnalyserNode {
    const node = context.createAnalyser();
    node.fftSize = METER_FFT;
    node.smoothingTimeConstant = 0.6;
    return node;
  }

  /**
   * Listens to the microphone for the meter only. The mic reaches the call
   * over WebRTC, not through this graph, so the analyser is a dead end and
   * nothing here is played back.
   */
  meterInput(stream: MediaStream): void {
    const context = this.ensureContext();
    if (!context) return;
    try {
      const source = context.createMediaStreamSource(stream);
      const analyser = this.analyser(context);
      source.connect(analyser);
      this.inputSource = source;
      this.meters.input = analyser;
    } catch {
      this.meters.input = null;
    }
  }

  /**
   * Routes the agent's audio through the effect chain. Returns false when the
   * browser has no Web Audio, in which case the caller should play the stream
   * straight through the audio element.
   */
  attach(stream: MediaStream, sound: CallSound): boolean {
    // Chrome only pulls frames from a remote WebRTC stream once it is attached
    // to a media element, so keep one alive and silent behind the graph.
    const element = document.createElement("audio");
    element.srcObject = stream;
    element.muted = true;
    element.autoplay = true;
    void element.play().catch(() => undefined);
    this.element = element;

    const context = this.ensureContext();
    if (!context) return false;

    try {
      const source = context.createMediaStreamSource(stream);
      let node: AudioNode = source;

      if (sound.phoneLine) {
        const highpass = context.createBiquadFilter();
        highpass.type = "highpass";
        highpass.frequency.value = PHONE_BAND.highpassHz;

        const lowpass = context.createBiquadFilter();
        lowpass.type = "lowpass";
        lowpass.frequency.value = PHONE_BAND.lowpassHz;

        const presence = context.createBiquadFilter();
        presence.type = "peaking";
        presence.frequency.value = PHONE_BAND.presenceHz;
        presence.gain.value = PHONE_BAND.presenceGainDb;
        presence.Q.value = 1;

        const makeup = context.createGain();
        makeup.gain.value = PHONE_BAND.outputGain;

        node.connect(highpass);
        highpass.connect(lowpass);
        lowpass.connect(presence);
        presence.connect(makeup);
        node = makeup;
      }

      // The meter taps the voice as the visitor hears it, after the band-limit.
      const analyser = this.analyser(context);
      node.connect(analyser);
      this.meters.output = analyser;

      node.connect(context.destination);

      if (sound.roomTone) this.startRoomTone(context);
      return true;
    } catch {
      // Fall back to plain playback if anything in the graph fails.
      this.stop();
      return false;
    }
  }

  private startRoomTone(context: AudioContext): void {
    const frames = Math.floor(context.sampleRate * ROOM_TONE.loopSeconds);
    const buffer = context.createBuffer(1, frames, context.sampleRate);
    fillRoomToneBuffer(buffer.getChannelData(0));

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const bandpass = context.createBiquadFilter();
    bandpass.type = "bandpass";
    bandpass.frequency.value = ROOM_TONE.bandpassHz;
    bandpass.Q.value = ROOM_TONE.bandpassQ;

    const lowpass = context.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = ROOM_TONE.lowpassHz;

    const gain = context.createGain();
    gain.gain.value = ROOM_TONE.gain;

    // A slow oscillator nudges the level so the floor breathes.
    const drift = context.createOscillator();
    drift.frequency.value = ROOM_TONE.driftHz;
    const driftGain = context.createGain();
    driftGain.gain.value = ROOM_TONE.gain * ROOM_TONE.driftDepth;
    drift.connect(driftGain);
    driftGain.connect(gain.gain);
    drift.start();

    source.connect(bandpass);
    bandpass.connect(lowpass);
    lowpass.connect(gain);
    gain.connect(context.destination);
    source.start();

    this.roomToneSource = source;
    this.roomToneGain = gain;
    this.drift = drift;
  }

  /** Plain playback, used when Web Audio is unavailable. */
  attachPlain(stream: MediaStream): void {
    const element = document.createElement("audio");
    element.srcObject = stream;
    element.autoplay = true;
    void element.play().catch(() => undefined);
    this.element = element;
  }

  stop(): void {
    for (const node of [this.roomToneSource, this.drift]) {
      try {
        node?.stop();
      } catch {
        // Already stopped.
      }
    }
    this.roomToneSource = null;
    this.drift = null;
    this.roomToneGain?.disconnect();
    this.roomToneGain = null;
    this.inputSource?.disconnect();
    this.inputSource = null;
    this.meters.input = null;
    this.meters.output = null;

    if (this.element) {
      this.element.srcObject = null;
      this.element.remove();
      this.element = null;
    }

    const context = this.context;
    this.context = null;
    void context?.close().catch(() => undefined);
  }
}

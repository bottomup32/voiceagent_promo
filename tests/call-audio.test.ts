import { describe, expect, it } from "vitest";
import { PHONE_BAND, ROOM_TONE, fillRoomToneBuffer, resolveCallSound } from "../lib/call-audio";
import { DEFAULT_VOICE, LIVE_VOICE_OPTIONS } from "../lib/types";

describe("resolveCallSound", () => {
  it("turns both effects on when nothing is stored", () => {
    expect(resolveCallSound(undefined)).toEqual({ phoneLine: true, roomTone: true });
    expect(resolveCallSound(null)).toEqual({ phoneLine: true, roomTone: true });
  });

  it("keeps an explicit off", () => {
    expect(resolveCallSound({ roomTone: false })).toEqual({
      phoneLine: true,
      roomTone: false,
    });
    expect(resolveCallSound({ phoneLine: false, roomTone: false })).toEqual({
      phoneLine: false,
      roomTone: false,
    });
  });
});

describe("phone band", () => {
  it("covers the speech range a phone line passes", () => {
    expect(PHONE_BAND.highpassHz).toBeGreaterThanOrEqual(200);
    expect(PHONE_BAND.lowpassHz).toBeLessThanOrEqual(4000);
    expect(PHONE_BAND.presenceHz).toBeGreaterThan(PHONE_BAND.highpassHz);
    expect(PHONE_BAND.presenceHz).toBeLessThan(PHONE_BAND.lowpassHz);
  });
});

describe("fillRoomToneBuffer", () => {
  it("fills the whole buffer within the audio range", () => {
    const channel = new Float32Array(2048);
    fillRoomToneBuffer(channel);
    expect(channel.some((sample) => sample !== 0)).toBe(true);
    for (const sample of channel) {
      expect(Math.abs(sample)).toBeLessThanOrEqual(1);
    }
  });

  it("stays quiet: the tone is a floor, not a sound", () => {
    const channel = new Float32Array(4096);
    fillRoomToneBuffer(channel);
    const rms = Math.sqrt(
      channel.reduce((sum, sample) => sum + sample * sample, 0) / channel.length,
    );
    expect(rms * ROOM_TONE.gain).toBeLessThan(0.01);
  });

  it("is low-passed, so neighbouring samples track each other", () => {
    const channel = new Float32Array(4096);
    fillRoomToneBuffer(channel);
    let jumps = 0;
    for (let i = 1; i < channel.length; i++) {
      if (Math.abs(channel[i] - channel[i - 1]) > 0.2) jumps++;
    }
    expect(jumps).toBe(0);
  });
});

describe("voice catalogue", () => {
  it("defaults to a North American voice", () => {
    const fallback = LIVE_VOICE_OPTIONS.find((voice) => voice.id === DEFAULT_VOICE);
    expect(fallback?.accent).toBe("North American");
  });

  it("labels every voice with an accent", () => {
    for (const voice of LIVE_VOICE_OPTIONS) {
      expect(voice.accent.length).toBeGreaterThan(0);
      expect(voice.id).toMatch(/^[a-z]+$/);
    }
  });
});

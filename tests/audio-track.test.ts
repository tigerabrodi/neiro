import { describe, expect, it } from "vitest";
import { AudioTrack } from "../src/audio-track";
import { encodeWav } from "../src/codecs/wav";

function generateSineWave(
  frequency: number,
  durationMs: number,
  sampleRate: number,
  amplitude: number = 1.0,
): Float32Array {
  const numSamples = Math.floor((durationMs / 1000) * sampleRate);
  const samples = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    samples[i] =
      amplitude * Math.sin(2 * Math.PI * frequency * (i / sampleRate));
  }
  return samples;
}

describe("AudioTrack", () => {
  it("full chain: fromBuffer → normalize → trimSilence → fadeOut → toMp3 produces valid MP3", async () => {
    const sampleRate = 44100;
    const sine = generateSineWave(440, 2000, sampleRate, 0.5);
    // Prepend 200ms silence, append 200ms silence
    const silenceSamples = Math.floor(0.2 * sampleRate);
    const padded = new Float32Array(
      silenceSamples + sine.length + silenceSamples,
    );
    padded.set(sine, silenceSamples);

    const wavBuffer = encodeWav([padded], sampleRate);

    const track = await AudioTrack.fromBuffer({ buffer: wavBuffer });
    const result = track.normalize().trimSilence().fadeOut({ ms: 100 }).toMp3();

    // Should produce a non-empty buffer
    expect(result.length).toBeGreaterThan(0);

    // Verify it's valid MP3 by decoding it back
    const decoded = await AudioTrack.fromBuffer({ buffer: result });
    expect(decoded.sampleRate).toBeGreaterThan(0);
    expect(decoded.channels).toBeGreaterThanOrEqual(1);
    expect(decoded.duration).toBeGreaterThan(0);
  });

  it("WAV round-trip: fromChannels → toWav → fromBuffer preserves data within 16-bit quantization", async () => {
    const sampleRate = 44100;
    const sine = generateSineWave(440, 100, sampleRate, 0.8);
    const original = AudioTrack.fromChannels({
      channels: [sine],
      sampleRate,
    });

    const wavBuffer = original.toWav();
    const roundTripped = await AudioTrack.fromBuffer({ buffer: wavBuffer });

    expect(roundTripped.sampleRate).toBe(sampleRate);
    expect(roundTripped.channels).toBe(1);
    expect(roundTripped.length).toBe(original.length);

    const origData = original.getChannel({ index: 0 });
    const rtData = roundTripped.getChannel({ index: 0 });

    // 16-bit quantization + float32 rounding: typically < 1e-4
    for (let i = 0; i < origData.length; i++) {
      expect(Math.abs(origData[i]! - rtData[i]!)).toBeLessThan(1e-4);
    }
  });

  it("silence duration: AudioTrack.silence({ durationMs: 1000 }).duration ≈ 1.0", () => {
    const track = AudioTrack.silence({ durationMs: 1000 });
    expect(track.duration).toBeCloseTo(1.0, 2);
    expect(track.sampleRate).toBe(44100);
    expect(track.channels).toBe(1);

    // All samples should be zero
    const data = track.getChannel({ index: 0 });
    for (let i = 0; i < data.length; i++) {
      expect(data[i]).toBe(0);
    }
  });

  it("immutability: track.gain({ db: 6 }) returns new track, original unchanged", () => {
    const sampleRate = 44100;
    const sine = generateSineWave(440, 100, sampleRate, 0.3);
    const original = AudioTrack.fromChannels({
      channels: [sine],
      sampleRate,
    });

    const gained = original.gain({ db: 6 });

    // Should be a different instance
    expect(gained).not.toBe(original);

    // Original should be unchanged
    const origData = original.getChannel({ index: 0 });
    for (let i = 0; i < origData.length; i++) {
      expect(origData[i]).toBeCloseTo(sine[i]!, 10);
    }

    // Gained should be louder (~2x for +6dB)
    const gainedData = gained.getChannel({ index: 0 });
    const ratio = Math.abs(gainedData[1]!) / Math.abs(origData[1]!);
    expect(ratio).toBeCloseTo(1.9953, 2); // 10^(6/20) ≈ 1.9953
  });

  it("method chaining: gain → fadeIn → fadeOut works", () => {
    const sampleRate = 44100;
    const sine = generateSineWave(440, 200, sampleRate, 0.5);
    const track = AudioTrack.fromChannels({
      channels: [sine],
      sampleRate,
    });

    const result = track.gain({ db: 6 }).fadeIn({ ms: 5 }).fadeOut({ ms: 10 });

    // Should still be a valid track
    expect(result.sampleRate).toBe(sampleRate);
    expect(result.channels).toBe(1);
    expect(result.length).toBe(sine.length);

    // First sample should be ~0 due to fade in
    const data = result.getChannel({ index: 0 });
    expect(Math.abs(data[0]!)).toBeLessThan(0.001);

    // Last sample should be ~0 due to fade out
    expect(Math.abs(data[data.length - 1]!)).toBeLessThan(0.001);
  });

  it("error cases: getChannel out of bounds throws, concat channel mismatch throws", () => {
    const sampleRate = 44100;
    const mono = AudioTrack.fromChannels({
      channels: [new Float32Array(100)],
      sampleRate,
    });
    const stereo = AudioTrack.fromChannels({
      channels: [new Float32Array(100), new Float32Array(100)],
      sampleRate,
    });

    expect(() => mono.getChannel({ index: 99 })).toThrow();
    expect(() => mono.getChannel({ index: -1 })).toThrow();
    expect(() => mono.concat({ other: stereo })).toThrow();
  });
});

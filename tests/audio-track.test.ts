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

function createPaddedConstantTone(
  leadingMs: number,
  toneMs: number,
  trailingMs: number,
  sampleRate: number,
  amplitude: number,
): Float32Array {
  const leadingSamples = Math.floor((leadingMs / 1000) * sampleRate);
  const toneSamples = Math.floor((toneMs / 1000) * sampleRate);
  const trailingSamples = Math.floor((trailingMs / 1000) * sampleRate);
  const output = new Float32Array(
    leadingSamples + toneSamples + trailingSamples,
  );
  output.fill(amplitude, leadingSamples, leadingSamples + toneSamples);
  return output;
}

function encodePcmS16le(channels: Int16Array[]): Buffer {
  const numChannels = channels.length;
  const numFrames = channels[0]?.length ?? 0;
  const buffer = Buffer.alloc(numFrames * numChannels * 2);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  let offset = 0;
  for (let i = 0; i < numFrames; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      view.setInt16(offset, channels[ch]![i]!, true);
      offset += 2;
    }
  }

  return buffer;
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

  it("trimSilence uses thresholdDb and default head/tail padding through the AudioTrack API", () => {
    const sampleRate = 1000;
    const padded = createPaddedConstantTone(40, 30, 80, sampleRate, 0.25);
    const track = AudioTrack.fromChannels({
      channels: [padded],
      sampleRate,
    });

    const defaultTrimmed = track.trimSilence();
    const customTrimmed = track.trimSilence({
      thresholdDb: -20,
      headMs: 0,
      tailMs: 0,
    });

    expect(defaultTrimmed.length).toBe(90);
    expect(customTrimmed.length).toBe(30);
    expect(Array.from(customTrimmed.getChannel({ index: 0 }))).toEqual(
      new Array(30).fill(0.25),
    );
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

  it("fromPcm returns correct sampleRate, channels, length, and duration", () => {
    const track = AudioTrack.fromPcm({
      buffer: encodePcmS16le([
        new Int16Array([0, 32767, -32768, 16384]),
        new Int16Array([16384, 0, -16384, 32767]),
      ]),
      sampleRate: 48000,
      channels: 2,
    });

    expect(track.sampleRate).toBe(48000);
    expect(track.channels).toBe(2);
    expect(track.length).toBe(4);
    expect(track.duration).toBe(4 / 48000);
  });

  it("fromPcm defaults to mono when channels is omitted", () => {
    const track = AudioTrack.fromPcm({
      buffer: encodePcmS16le([new Int16Array([0, 16384, -16384])]),
      sampleRate: 48000,
    });

    expect(track.channels).toBe(1);
    expect(track.length).toBe(3);
    expect(Array.from(track.getChannel({ index: 0 }))).toEqual([0, 0.5, -0.5]);
  });

  it("WAV round-trip: fromPcm → toWav → fromBuffer preserves data within 16-bit quantization", async () => {
    const original = AudioTrack.fromPcm({
      buffer: encodePcmS16le([
        new Int16Array([0, 12000, -12000, 32767, -32768]),
      ]),
      sampleRate: 48000,
    });

    const wavBuffer = original.toWav();
    const roundTripped = await AudioTrack.fromBuffer({ buffer: wavBuffer });

    expect(roundTripped.sampleRate).toBe(48000);
    expect(roundTripped.channels).toBe(1);
    expect(roundTripped.length).toBe(original.length);

    const originalData = original.getChannel({ index: 0 });
    const roundTrippedData = roundTripped.getChannel({ index: 0 });

    for (let i = 0; i < originalData.length; i++) {
      expect(Math.abs(originalData[i]! - roundTrippedData[i]!)).toBeLessThan(
        1 / 32768 + 1e-7,
      );
    }
  });

  it("fromPcm → normalize → fadeOut → toWav produces a valid WAV that re-decodes", async () => {
    const track = AudioTrack.fromPcm({
      buffer: encodePcmS16le([
        new Int16Array(Array.from({ length: 480 }, (_, i) => (i % 2 === 0 ? 12000 : -12000))),
      ]),
      sampleRate: 48000,
    });

    const wavBuffer = track.normalize().fadeOut({ ms: 2 }).toWav();
    const decoded = await AudioTrack.fromBuffer({ buffer: wavBuffer });

    expect(decoded.sampleRate).toBe(48000);
    expect(decoded.channels).toBe(1);
    expect(decoded.length).toBe(track.length);
    expect(decoded.duration).toBeGreaterThan(0);
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

  it("error cases: getChannel out of bounds throws, concat/mix mismatch throws", () => {
    const sampleRate = 44100;
    const mono = AudioTrack.fromChannels({
      channels: [new Float32Array(100)],
      sampleRate,
    });
    const mono48k = AudioTrack.fromChannels({
      channels: [new Float32Array(100)],
      sampleRate: 48000,
    });
    const stereo = AudioTrack.fromChannels({
      channels: [new Float32Array(100), new Float32Array(100)],
      sampleRate,
    });

    expect(() => mono.getChannel({ index: 99 })).toThrow();
    expect(() => mono.getChannel({ index: -1 })).toThrow();
    expect(() => mono.concat({ other: mono48k })).toThrow(
      "Cannot concat tracks with different sample rates",
    );
    expect(() => mono.mix({ other: mono48k })).toThrow(
      "Cannot mix tracks with different sample rates",
    );
    expect(() => mono.concat({ other: stereo })).toThrow(
      "Cannot concat tracks with different channel counts",
    );
    expect(() => mono.mix({ other: stereo })).toThrow(
      "Cannot mix tracks with different channel counts",
    );
  });
});

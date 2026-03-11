import { describe, expect, it } from "vitest";
import { trimSilence } from "../../src/transforms/trim-silence";

const sampleRate = 1000;

function createPaddedConstantTone({
  leadingMs,
  toneMs,
  trailingMs,
  amplitude,
}: {
  leadingMs: number;
  toneMs: number;
  trailingMs: number;
  amplitude: number;
}): Float32Array {
  const leadingSamples = Math.floor((leadingMs / 1000) * sampleRate);
  const toneSamples = Math.floor((toneMs / 1000) * sampleRate);
  const trailingSamples = Math.floor((trailingMs / 1000) * sampleRate);
  const output = new Float32Array(
    leadingSamples + toneSamples + trailingSamples,
  );

  output.fill(amplitude, leadingSamples, leadingSamples + toneSamples);
  return output;
}

function expectAllSamplesToBe(
  samples: Float32Array,
  expected: number,
  start: number = 0,
  end: number = samples.length,
): void {
  for (let i = start; i < end; i++) {
    expect(samples[i]!).toBeCloseTo(expected, 6);
  }
}

describe("trimSilence", () => {
  it("keeps the default 10ms head and 50ms tail around detected content", () => {
    const padded = createPaddedConstantTone({
      leadingMs: 40,
      toneMs: 30,
      trailingMs: 80,
      amplitude: 0.25,
    });

    const output = trimSilence([padded], sampleRate);
    const trimmed = output[0]!;

    expect(trimmed.length).toBe(90);
    expectAllSamplesToBe(trimmed, 0, 0, 10);
    expectAllSamplesToBe(trimmed, 0.25, 10, 40);
    expectAllSamplesToBe(trimmed, 0, 40, 90);
  });

  it("interprets thresholdDb in dB instead of linear amplitude", () => {
    const padded = createPaddedConstantTone({
      leadingMs: 20,
      toneMs: 20,
      trailingMs: 20,
      amplitude: 0.15,
    });

    const output = trimSilence([padded], sampleRate, {
      thresholdDb: -20,
      headMs: 0,
      tailMs: 0,
    });

    expect(output[0]!.length).toBe(20);
    expectAllSamplesToBe(output[0]!, 0.15);
  });

  it("ignores isolated sample spikes when window RMS stays below threshold", () => {
    const padded = createPaddedConstantTone({
      leadingMs: 40,
      toneMs: 20,
      trailingMs: 40,
      amplitude: 0.8,
    });
    padded[5] = 1;

    const output = trimSilence([padded], sampleRate, {
      thresholdDb: -6,
      headMs: 0,
      tailMs: 0,
    });

    expect(output[0]!.length).toBe(20);
    expectAllSamplesToBe(output[0]!, 0.8);
  });

  it("preserves content detected in only one stereo channel", () => {
    const left = new Float32Array(80);
    const right = createPaddedConstantTone({
      leadingMs: 20,
      toneMs: 30,
      trailingMs: 30,
      amplitude: 0.25,
    });

    const output = trimSilence([left, right], sampleRate, {
      headMs: 0,
      tailMs: 0,
    });

    expect(output[0]!.length).toBe(30);
    expect(output[1]!.length).toBe(30);
    expectAllSamplesToBe(output[0]!, 0);
    expectAllSamplesToBe(output[1]!, 0.25);
  });

  it("returns unchanged copied audio when the input is all silence", () => {
    const silence = new Float32Array(60);

    const output = trimSilence([silence], sampleRate);

    expect(output[0]).not.toBe(silence);
    expect(output[0]!.length).toBe(silence.length);
    expectAllSamplesToBe(output[0]!, 0);
  });

  it("handles clips shorter than one analysis window", () => {
    const shortClip = new Float32Array([0, 0, 0.8, 0.8, 0.8, 0.8]);

    const output = trimSilence([shortClip], sampleRate, {
      headMs: 0,
      tailMs: 0,
    });

    expect(output[0]).not.toBe(shortClip);
    expect(Array.from(output[0]!)).toEqual(Array.from(shortClip));
  });

  it("throws when headMs is negative", () => {
    const tone = createPaddedConstantTone({
      leadingMs: 0,
      toneMs: 20,
      trailingMs: 0,
      amplitude: 0.5,
    });

    expect(() =>
      trimSilence([tone], sampleRate, { headMs: -1 }),
    ).toThrow("headMs");
  });

  it("throws when tailMs is negative", () => {
    const tone = createPaddedConstantTone({
      leadingMs: 0,
      toneMs: 20,
      trailingMs: 0,
      amplitude: 0.5,
    });

    expect(() =>
      trimSilence([tone], sampleRate, { tailMs: -1 }),
    ).toThrow("tailMs");
  });

  it("throws when thresholdDb is positive", () => {
    const tone = createPaddedConstantTone({
      leadingMs: 0,
      toneMs: 20,
      trailingMs: 0,
      amplitude: 0.5,
    });

    expect(() =>
      trimSilence([tone], sampleRate, { thresholdDb: 1 }),
    ).toThrow("thresholdDb");
  });
});

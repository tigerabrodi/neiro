import { describe, expect, it } from "vitest";
import { resampleChannels } from "../../src/transforms/resample";

describe("resampleChannels", () => {
  it("changes sample rate and keeps channel count", () => {
    const input = [
      new Float32Array([0, 1, 0, -1]),
      new Float32Array([1, 0, -1, 0]),
    ];

    const output = resampleChannels(input, {
      sourceSampleRate: 4,
      targetSampleRate: 8,
    });

    expect(output).toHaveLength(2);
    expect(output[0]!.length).toBe(8);
    expect(output[1]!.length).toBe(8);
  });

  it("preserves duration closely", () => {
    const input = [new Float32Array([0, 0.5, 1, 0.5, 0, -0.5])];

    const output = resampleChannels(input, {
      sourceSampleRate: 6,
      targetSampleRate: 9,
    });

    const sourceDuration = input[0]!.length / 6;
    const targetDuration = output[0]!.length / 9;
    expect(targetDuration).toBeCloseTo(sourceDuration, 5);
  });

  it("same-rate resampling returns equivalent copied output", () => {
    const input = [new Float32Array([0.1, -0.2, 0.3])];

    const output = resampleChannels(input, {
      sourceSampleRate: 44100,
      targetSampleRate: 44100,
    });

    expect(output[0]).not.toBe(input[0]);
    expect(Array.from(output[0]!)).toEqual(Array.from(input[0]!));
  });

  it("preserves endpoints cleanly when resampling", () => {
    const input = [new Float32Array([0, 1, 0])];

    const output = resampleChannels(input, {
      sourceSampleRate: 3,
      targetSampleRate: 5,
    });

    expect(output[0]![0]).toBeCloseTo(0, 6);
    expect(output[0]![output[0]!.length - 1]).toBeCloseTo(0, 6);
  });

  it("handles zero-length input safely", () => {
    const input = [new Float32Array(0)];

    const output = resampleChannels(input, {
      sourceSampleRate: 44100,
      targetSampleRate: 48000,
    });

    expect(output[0]).not.toBe(input[0]);
    expect(output[0]!.length).toBe(0);
  });

  it("handles single-sample input safely", () => {
    const input = [new Float32Array([0.25])];

    const output = resampleChannels(input, {
      sourceSampleRate: 1,
      targetSampleRate: 4,
    });

    expect(Array.from(output[0]!)).toEqual([0.25, 0.25, 0.25, 0.25]);
  });

  it("throws for invalid target sample rates", () => {
    const input = [new Float32Array([0, 1])];
    const expectedMessage =
      "resample sampleRate must be a finite positive number";

    expect(() =>
      resampleChannels(input, {
        sourceSampleRate: 44100,
        targetSampleRate: 0,
      }),
    ).toThrow(expectedMessage);
    expect(() =>
      resampleChannels(input, {
        sourceSampleRate: 44100,
        targetSampleRate: -1,
      }),
    ).toThrow(expectedMessage);
    expect(() =>
      resampleChannels(input, {
        sourceSampleRate: 44100,
        targetSampleRate: Number.NaN,
      }),
    ).toThrow(expectedMessage);
    expect(() =>
      resampleChannels(input, {
        sourceSampleRate: 44100,
        targetSampleRate: Number.POSITIVE_INFINITY,
      }),
    ).toThrow(expectedMessage);
  });
});

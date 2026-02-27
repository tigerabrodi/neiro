import { describe, expect, it } from "vitest";
import { normalizeLoudness } from "../../src/transforms/normalize";
import { calculateIntegratedLoudness } from "../../src/dsp/lufs";
import { measureTruePeak } from "../../src/dsp/true-peak";

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

describe("normalizeLoudness", () => {
  it("output loudness is within 0.5 LU of target", () => {
    const sampleRate = 48000;
    const sine = generateSineWave(440, 1000, sampleRate, 0.5);
    const channels = [sine, sine];
    const output = normalizeLoudness(channels, sampleRate, { target: -14 });

    const outputLoudness = calculateIntegratedLoudness(output, sampleRate);
    expect(Math.abs(outputLoudness - -14)).toBeLessThan(0.5);
  });

  it("output true peak is at or below peakLimit", () => {
    const sampleRate = 48000;
    const sine = generateSineWave(440, 1000, sampleRate, 0.9);
    const channels = [sine, sine];
    const output = normalizeLoudness(channels, sampleRate, {
      target: -14,
      peakLimit: -1,
    });

    const peakLimitLinear = Math.pow(10, -1 / 20);
    const leftPeak = measureTruePeak(output[0]!, sampleRate);
    const rightPeak = measureTruePeak(output[1]!, sampleRate);
    expect(Math.max(leftPeak, rightPeak)).toBeLessThanOrEqual(
      peakLimitLinear + 0.01,
    );
  });

  it("silence input returns silence unchanged", () => {
    const sampleRate = 48000;
    const silence = new Float32Array(48000);
    const output = normalizeLoudness([silence], sampleRate);
    for (let i = 0; i < output[0]!.length; i++) {
      expect(output[0]![i]).toBe(0);
    }
  });

  it("stereo balance is preserved", () => {
    const sampleRate = 48000;
    const left = generateSineWave(440, 1000, sampleRate, 0.5);
    const right = generateSineWave(440, 1000, sampleRate, 0.25);
    const output = normalizeLoudness([left, right], sampleRate, {
      target: -14,
    });

    // Both channels should get the same gain, so ratio should be preserved
    // Compare RMS ratio
    let leftRms = 0;
    let rightRms = 0;
    for (let i = 0; i < output[0]!.length; i++) {
      leftRms += output[0]![i]! * output[0]![i]!;
      rightRms += output[1]![i]! * output[1]![i]!;
    }
    leftRms = Math.sqrt(leftRms / output[0]!.length);
    rightRms = Math.sqrt(rightRms / output[1]!.length);

    // Original ratio was 0.5/0.25 = 2.0
    expect(leftRms / rightRms).toBeCloseTo(2.0, 1);
  });
});

import { describe, expect, it } from "vitest";
import {
  measureTruePeak,
  measureTruePeakStereo,
} from "../../src/dsp/true-peak";

describe("measureTruePeak", () => {
  it("single impulse: true peak >= sample peak", () => {
    // A single 1.0 sample surrounded by zeros — interpolated peak should be >= 1.0
    const samples = new Float32Array(1024);
    samples[512] = 1.0;

    const peak = measureTruePeak(samples, 48000);
    expect(peak).toBeGreaterThanOrEqual(1.0);
  });

  it("full-scale constant signal: true peak is 1.0", () => {
    // DC full-scale signal — no intersample overshoot possible
    const samples = new Float32Array(1024);
    samples.fill(1.0);

    const peak = measureTruePeak(samples, 48000);
    expect(peak).toBeGreaterThanOrEqual(0.99);
    expect(peak).toBeLessThanOrEqual(1.01);
  });

  it("silence: true peak is 0", () => {
    const samples = new Float32Array(1024);
    const peak = measureTruePeak(samples, 48000);
    expect(peak).toBe(0);
  });

  it("intersample overshoot: two consecutive samples at 0.9 and -0.9", () => {
    // Sharp transition causes ringing — true peak should exceed 0.9
    const samples = new Float32Array(1024);
    samples[512] = 0.9;
    samples[513] = -0.9;

    const peak = measureTruePeak(samples, 48000);
    expect(peak).toBeGreaterThan(0.9);
  });
});

describe("measureTruePeakStereo", () => {
  it("returns max across both channels", () => {
    const left = new Float32Array(1024);
    const right = new Float32Array(1024);

    // Left channel: peak at 0.5
    left[512] = 0.5;
    // Right channel: peak at 0.8
    right[512] = 0.8;

    const peak = measureTruePeakStereo(left, right, 48000);
    // Should return the right channel's peak since it's larger
    expect(peak).toBeGreaterThanOrEqual(0.8);
  });
});

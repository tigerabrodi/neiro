import { describe, expect, it } from "vitest";
import { applyFadeIn, applyFadeOut } from "../../src/transforms/fade";

describe("applyFadeIn", () => {
  it("first sample is 0", () => {
    const input = [new Float32Array([1.0, 1.0, 1.0, 1.0, 1.0])];
    const output = applyFadeIn(input, 44100, 1000);
    expect(output[0]![0]).toBe(0);
  });

  it("samples beyond fade duration are untouched", () => {
    const sampleRate = 1000; // 1 sample per ms
    const samples = new Float32Array(200).fill(0.8);
    const output = applyFadeIn([samples], sampleRate, 100);
    // Sample at index 100 (= 100ms) is at the boundary
    // Samples well beyond the fade should be untouched
    expect(output[0]![150]).toBeCloseTo(0.8, 5);
    expect(output[0]![199]).toBeCloseTo(0.8, 5);
  });
});

describe("applyFadeOut", () => {
  it("last sample is 0", () => {
    const input = [new Float32Array([1.0, 1.0, 1.0, 1.0, 1.0])];
    const output = applyFadeOut(input, 44100, 1000);
    expect(output[0]![4]).toBe(0);
  });

  it("samples before fade region are untouched", () => {
    const sampleRate = 1000;
    const samples = new Float32Array(200).fill(0.8);
    const output = applyFadeOut([samples], sampleRate, 100);
    expect(output[0]![0]).toBeCloseTo(0.8, 5);
    expect(output[0]![50]).toBeCloseTo(0.8, 5);
  });
});

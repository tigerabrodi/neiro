import { describe, expect, it } from "vitest";
import { mixChannels } from "../../src/transforms/mix";

describe("mixChannels", () => {
  it("mixing with silence returns original", () => {
    const a = [new Float32Array([0.5, -0.5, 0.25])];
    const b = [new Float32Array([0, 0, 0])];
    const output = mixChannels(a, b);
    expect(output[0]![0]).toBeCloseTo(0.5, 5);
    expect(output[0]![1]).toBeCloseTo(-0.5, 5);
    expect(output[0]![2]).toBeCloseTo(0.25, 5);
  });

  it("output length is max of both", () => {
    const a = [new Float32Array(100)];
    const b = [new Float32Array(200)];
    const output = mixChannels(a, b);
    expect(output[0]!.length).toBe(200);
  });

  it("gain is applied to second track", () => {
    const a = [new Float32Array([0])];
    const b = [new Float32Array([0.5])];
    // -6 dB halves amplitude → 0.5 * ~0.501 ≈ 0.25
    const output = mixChannels(a, b, -6);
    expect(output[0]![0]).toBeCloseTo(0.25, 1);
  });
});

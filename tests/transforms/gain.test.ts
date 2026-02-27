import { describe, expect, it } from "vitest";
import { applyGain } from "../../src/transforms/gain";

describe("applyGain", () => {
  it("0 dB produces no change", () => {
    const input = [new Float32Array([0.5, -0.5, 0.25])];
    const output = applyGain(input, 0);
    expect(output[0]![0]).toBeCloseTo(0.5, 10);
    expect(output[0]![1]).toBeCloseTo(-0.5, 10);
    expect(output[0]![2]).toBeCloseTo(0.25, 10);
  });

  it("+6 dB approximately doubles amplitude", () => {
    const input = [new Float32Array([0.25, -0.25])];
    const output = applyGain(input, 6);
    expect(output[0]![0]).toBeCloseTo(0.5, 1);
    expect(output[0]![1]).toBeCloseTo(-0.5, 1);
  });

  it("-6 dB approximately halves amplitude", () => {
    const input = [new Float32Array([0.8, -0.8])];
    const output = applyGain(input, -6);
    expect(output[0]![0]).toBeCloseTo(0.4, 1);
    expect(output[0]![1]).toBeCloseTo(-0.4, 1);
  });
});

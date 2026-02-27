import { describe, expect, it } from "vitest";
import { changeSpeed } from "../../src/transforms/speed";

describe("changeSpeed", () => {
  it("speed(2) halves length", () => {
    const input = [new Float32Array(1000)];
    const output = changeSpeed(input, 2);
    expect(output[0]!.length).toBe(500);
  });

  it("speed(0.5) doubles length", () => {
    const input = [new Float32Array(1000)];
    const output = changeSpeed(input, 0.5);
    expect(output[0]!.length).toBe(2000);
  });

  it("speed(1) produces no change", () => {
    const input = [new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5])];
    const output = changeSpeed(input, 1);
    expect(output[0]!.length).toBe(5);
    for (let i = 0; i < 5; i++) {
      expect(output[0]![i]).toBeCloseTo(input[0]![i]!, 5);
    }
  });
});

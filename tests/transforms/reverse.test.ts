import { describe, expect, it } from "vitest";
import { reverseChannels } from "../../src/transforms/reverse";

describe("reverseChannels", () => {
  it("double reverse returns original", () => {
    const input = [new Float32Array([1, 2, 3, 4, 5])];
    const reversed = reverseChannels(input);
    const doubleReversed = reverseChannels(reversed);
    for (let i = 0; i < 5; i++) {
      expect(doubleReversed[0]![i]).toBe(input[0]![i]);
    }
  });

  it("first sample becomes last", () => {
    const input = [new Float32Array([10, 20, 30])];
    const output = reverseChannels(input);
    expect(output[0]![0]).toBe(30);
    expect(output[0]![1]).toBe(20);
    expect(output[0]![2]).toBe(10);
  });
});

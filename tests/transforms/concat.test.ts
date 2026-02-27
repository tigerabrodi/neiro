import { describe, expect, it } from "vitest";
import { concatChannels } from "../../src/transforms/concat";

describe("concatChannels", () => {
  it("output length is sum of inputs", () => {
    const a = [new Float32Array(100)];
    const b = [new Float32Array(200)];
    const output = concatChannels(a, b);
    expect(output[0]!.length).toBe(300);
  });

  it("content is in order", () => {
    const a = [new Float32Array([1, 2, 3])];
    const b = [new Float32Array([4, 5])];
    const output = concatChannels(a, b);
    expect(output[0]![0]).toBe(1);
    expect(output[0]![1]).toBe(2);
    expect(output[0]![2]).toBe(3);
    expect(output[0]![3]).toBe(4);
    expect(output[0]![4]).toBe(5);
  });
});

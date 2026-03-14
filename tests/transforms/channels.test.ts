import { describe, expect, it } from "vitest";
import { downmixToMono, upmixMonoToStereo } from "../../src/transforms/channels";

describe("channel conversion helpers", () => {
  it("toMono averages stereo channels correctly", () => {
    const output = downmixToMono([
      new Float32Array([1, -1, 0.5]),
      new Float32Array([0, 1, -0.5]),
    ]);

    expect(Array.from(output)).toEqual([0.5, 0, 0]);
  });

  it("toMono on mono returns equivalent copied output", () => {
    const input = new Float32Array([0.25, -0.5, 0.75]);
    const output = downmixToMono([input]);

    expect(output).not.toBe(input);
    expect(Array.from(output)).toEqual(Array.from(input));
  });

  it("toStereo duplicates mono input", () => {
    const mono = new Float32Array([0.25, -0.5, 0.75]);
    const [left, right] = upmixMonoToStereo(mono);

    expect(left).not.toBe(mono);
    expect(right).not.toBe(mono);
    expect(Array.from(left)).toEqual(Array.from(mono));
    expect(Array.from(right)).toEqual(Array.from(mono));
  });

  it("toStereo on stereo-equivalent input remains equivalent when copied", () => {
    const mono = new Float32Array([0.1, 0.2]);
    const [left, right] = upmixMonoToStereo(mono);

    expect(left).not.toBe(right);
    expect(left[0]!).toBeCloseTo(0.1, 6);
    expect(left[1]!).toBeCloseTo(0.2, 6);
    expect(right[0]!).toBeCloseTo(0.1, 6);
    expect(right[1]!).toBeCloseTo(0.2, 6);
  });

  it("multi-channel downmix averages all channels equally", () => {
    const output = downmixToMono([
      new Float32Array([1, 0]),
      new Float32Array([0, 1]),
      new Float32Array([-1, 1]),
    ]);

    expect(output[0]!).toBeCloseTo(0, 6);
    expect(output[1]!).toBeCloseTo(2 / 3, 6);
  });
});

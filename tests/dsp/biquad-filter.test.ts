import { describe, expect, it } from "vitest";
import { BiquadFilter } from "../../src/dsp/biquad-filter";

const unity = { b0: 1, b1: 0, b2: 0, a0: 1, a1: 0, a2: 0 };

describe("BiquadFilter", () => {
  it("unity filter passes signal through unchanged", () => {
    const filter = new BiquadFilter(unity);
    const input = new Float32Array([1, 0.5, -0.3, 0, 0.7]);
    const output = filter.processBuffer(input);
    for (let i = 0; i < input.length; i++) {
      expect(output[i]).toBeCloseTo(input[i], 10);
    }
  });

  it("known coefficients produce expected output", () => {
    // Simple first-order low-pass embedded in biquad form:
    // y[n] = 0.5*x[n] + 0.5*x[n-1]
    const coeffs = { b0: 0.5, b1: 0.5, b2: 0, a0: 1, a1: 0, a2: 0 };
    const filter = new BiquadFilter(coeffs);

    // Input: impulse [1, 0, 0, 0]
    // Expected: y[0]=0.5*1+0.5*0=0.5, y[1]=0.5*0+0.5*1=0.5, y[2]=0, y[3]=0
    const input = new Float32Array([1, 0, 0, 0]);
    const output = filter.processBuffer(input);

    expect(output[0]).toBeCloseTo(0.5, 10);
    expect(output[1]).toBeCloseTo(0.5, 10);
    expect(output[2]).toBeCloseTo(0, 10);
    expect(output[3]).toBeCloseTo(0, 10);
  });

  it("reset() allows identical output from same input twice", () => {
    // Use a filter with feedback so state matters
    const coeffs = { b0: 1, b1: 0.5, b2: 0, a0: 1, a1: -0.3, a2: 0 };
    const filter = new BiquadFilter(coeffs);
    const input = new Float32Array([1, 0.5, -0.2, 0.8, 0]);

    const first = filter.processBuffer(input);
    filter.reset();
    const second = filter.processBuffer(input);

    for (let i = 0; i < input.length; i++) {
      expect(second[i]).toBeCloseTo(first[i], 10);
    }
  });

  it("processBuffer() matches sequential process() calls", () => {
    const coeffs = { b0: 0.8, b1: -0.2, b2: 0.1, a0: 1, a1: 0.3, a2: -0.1 };
    const input = new Float32Array([1, -0.5, 0.3, 0, 0.7, -1]);

    const filterA = new BiquadFilter(coeffs);
    const bufferResult = filterA.processBuffer(input);

    const filterB = new BiquadFilter(coeffs);
    const sampleResults = new Float32Array(input.length);
    for (let i = 0; i < input.length; i++) {
      sampleResults[i] = filterB.process(input[i]);
    }

    for (let i = 0; i < input.length; i++) {
      expect(bufferResult[i]).toBeCloseTo(sampleResults[i], 10);
    }
  });
});

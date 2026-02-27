import { describe, expect, it } from "vitest";
import { dbToLinear, linearToDb } from "../../src/dsp/utils";

describe("dbToLinear", () => {
  it("converts 0 dB to 1", () => {
    expect(dbToLinear(0)).toBe(1);
  });

  it("converts -6 dB to approximately 0.501 (half amplitude)", () => {
    expect(dbToLinear(-6)).toBeCloseTo(0.501, 2);
  });

  it("converts -Infinity to 0", () => {
    expect(dbToLinear(-Infinity)).toBe(0);
  });
});

describe("linearToDb", () => {
  it("converts 1 to 0 dB", () => {
    expect(linearToDb(1)).toBe(0);
  });

  it("converts 0 to -Infinity", () => {
    expect(linearToDb(0)).toBe(-Infinity);
  });
});

describe("round-trip", () => {
  it("dbToLinear(linearToDb(x)) returns x", () => {
    const values = [0.5, 1, 0.001, 0.9, 2];
    for (const x of values) {
      expect(dbToLinear(linearToDb(x))).toBeCloseTo(x, 10);
    }
  });
});

import { describe, expect, it } from "vitest";
import {
  applyKWeighting,
  getChannelWeight,
} from "../../src/dsp/k-weighting";

function rms(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i]! * samples[i]!;
  }
  return Math.sqrt(sum / samples.length);
}

describe("applyKWeighting", () => {
  it("DC signal is attenuated (high-pass behavior from RLB filter)", () => {
    const sampleRate = 48000;
    const length = sampleRate; // 1 second
    const dc = new Float32Array(length).fill(1.0);

    const output = applyKWeighting(dc, sampleRate);
    const outputRms = rms(output);

    // DC should be heavily attenuated by the RLB high-pass
    expect(outputRms).toBeLessThan(0.1);
  });

  it("high-frequency signal passes with gain (pre-filter high-shelf boost)", () => {
    const sampleRate = 48000;
    const length = sampleRate; // 1 second
    const freq = 10000; // 10kHz — well above 1.5kHz shelf
    const input = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      input[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate);
    }

    const output = applyKWeighting(input, sampleRate);
    const inputRms = rms(input);
    const outputRms = rms(output);

    // Pre-filter adds ~+4dB above 1.5kHz, so output should be louder
    expect(outputRms).toBeGreaterThan(inputRms);
  });

  it("does not throw for 48000 Hz", () => {
    const samples = new Float32Array(1000);
    expect(() => applyKWeighting(samples, 48000)).not.toThrow();
  });

  it("does not throw for 44100 Hz", () => {
    const samples = new Float32Array(1000);
    expect(() => applyKWeighting(samples, 44100)).not.toThrow();
  });

  it("throws on unsupported sample rate", () => {
    const samples = new Float32Array(1000);
    expect(() => applyKWeighting(samples, 22050)).toThrow(
      /unsupported sample rate/i
    );
  });
});

describe("getChannelWeight", () => {
  it("mono channel weight is 1.0", () => {
    expect(getChannelWeight(0, 1)).toBe(1.0);
  });

  it("stereo channels get weight 1.0", () => {
    expect(getChannelWeight(0, 2)).toBe(1.0);
    expect(getChannelWeight(1, 2)).toBe(1.0);
  });

  it("5.1 surround: front channels (L, R, C) get weight 1.0", () => {
    expect(getChannelWeight(0, 6)).toBe(1.0);
    expect(getChannelWeight(1, 6)).toBe(1.0);
    expect(getChannelWeight(2, 6)).toBe(1.0);
  });

  it("5.1 surround: LFE (index 3) returns 0.0", () => {
    expect(getChannelWeight(3, 6)).toBe(0.0);
  });

  it("5.1 surround: surround channels (Ls, Rs) return 1.41253754462275", () => {
    expect(getChannelWeight(4, 6)).toBe(1.41253754462275);
    expect(getChannelWeight(5, 6)).toBe(1.41253754462275);
  });
});

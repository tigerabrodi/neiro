import { describe, expect, it } from "vitest";
import {
  calculateIntegratedLoudness,
  measureLUFS,
} from "../../src/dsp/lufs";
import { dbToLinear } from "../../src/dsp/utils";

function generateSine(
  frequency: number,
  durationMs: number,
  sampleRate: number,
  amplitude: number = 1.0
): Float32Array {
  const numSamples = Math.floor((durationMs / 1000) * sampleRate);
  const samples = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    samples[i] =
      amplitude * Math.sin((2 * Math.PI * frequency * i) / sampleRate);
  }
  return samples;
}

describe("calculateIntegratedLoudness", () => {
  it("silence returns -Infinity", () => {
    const silence = new Float32Array(48000); // 1 second at 48kHz
    const lufs = calculateIntegratedLoudness([silence], 48000);
    expect(lufs).toBe(-Infinity);
  });

  it("audio shorter than 400ms returns -Infinity", () => {
    // 100ms of sine at 48kHz — too short for a single 400ms block
    const short = generateSine(997, 100, 48000);
    const lufs = calculateIntegratedLoudness([short], 48000);
    expect(lufs).toBe(-Infinity);
  });

  it("full-scale sine wave ≈ -3 LUFS", () => {
    const sine = generateSine(997, 1000, 48000, 1.0);
    const lufs = calculateIntegratedLoudness([sine], 48000);
    // Full-scale sine should be approximately -3.01 LUFS
    expect(lufs).toBeGreaterThan(-3.5);
    expect(lufs).toBeLessThan(-2.5);
  });

  it("-20 dB sine wave ≈ -23 LUFS", () => {
    const amplitude = dbToLinear(-20);
    const sine = generateSine(997, 1000, 48000, amplitude);
    const lufs = calculateIntegratedLoudness([sine], 48000);
    // -20 dB sine should be approximately -23 LUFS
    expect(lufs).toBeGreaterThan(-23.5);
    expect(lufs).toBeLessThan(-22.5);
  });

  it("mono and stereo produce consistent results", () => {
    const mono = generateSine(997, 1000, 48000, 0.5);
    const stereoL = new Float32Array(mono);
    const stereoR = new Float32Array(mono);

    const monoLufs = calculateIntegratedLoudness([mono], 48000);
    const stereoLufs = calculateIntegratedLoudness(
      [stereoL, stereoR],
      48000
    );

    // Per ITU-R BS.1770-4, stereo sums power across channels.
    // Duplicating mono to stereo adds ~3.01 dB (10*log10(2)).
    const expectedDifference = 10 * Math.log10(2); // ~3.0103
    expect(Math.abs(stereoLufs - monoLufs - expectedDifference)).toBeLessThan(
      0.1
    );
  });

  it("both sample rates produce consistent results", () => {
    const sine44 = generateSine(997, 1000, 44100, 0.5);
    const sine48 = generateSine(997, 1000, 48000, 0.5);

    const lufs44 = calculateIntegratedLoudness([sine44], 44100);
    const lufs48 = calculateIntegratedLoudness([sine48], 48000);

    // Same signal at different sample rates should give results within ±0.5 LU
    expect(Math.abs(lufs44 - lufs48)).toBeLessThan(0.5);
  });
});

describe("measureLUFS", () => {
  it("works with mono (single channel)", () => {
    const mono = generateSine(997, 1000, 48000, 1.0);
    const lufs = measureLUFS(mono, null, 48000);
    expect(lufs).toBeGreaterThan(-3.5);
    expect(lufs).toBeLessThan(-2.5);
  });

  it("works with stereo (two channels)", () => {
    const left = generateSine(997, 1000, 48000, 1.0);
    const right = generateSine(997, 1000, 48000, 1.0);
    const lufs = measureLUFS(left, right, 48000);
    // Stereo full-scale sine: ~-3 LUFS (mono) + ~3 dB (stereo sum) ≈ 0 LUFS
    expect(lufs).toBeGreaterThan(-0.5);
    expect(lufs).toBeLessThan(0.5);
  });
});

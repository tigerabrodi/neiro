import { describe, expect, it } from "vitest";
import { trimSilence } from "../../src/transforms/trim-silence";

function generatePaddedTone(
  leadingSilenceMs: number,
  toneMs: number,
  trailingSilenceMs: number,
  sampleRate: number = 44100,
): Float32Array {
  const leading = Math.floor((leadingSilenceMs / 1000) * sampleRate);
  const tone = Math.floor((toneMs / 1000) * sampleRate);
  const trailing = Math.floor((trailingSilenceMs / 1000) * sampleRate);
  const total = new Float32Array(leading + tone + trailing);

  for (let i = 0; i < tone; i++) {
    total[leading + i] =
      0.5 * Math.sin(2 * Math.PI * 440 * (i / sampleRate));
  }
  return total;
}

describe("trimSilence", () => {
  const sampleRate = 44100;

  it("leading silence is removed", () => {
    const padded = generatePaddedTone(500, 200, 0, sampleRate);
    const output = trimSilence([padded], sampleRate);
    // Output should be shorter than input (leading silence removed)
    expect(output[0]!.length).toBeLessThan(padded.length);
    // First sample should be non-silent (or close to it)
    // Check that early samples have signal
    let hasSignal = false;
    for (let i = 0; i < 100; i++) {
      if (Math.abs(output[0]![i]!) > 0.01) {
        hasSignal = true;
        break;
      }
    }
    expect(hasSignal).toBe(true);
  });

  it("trailing silence is removed", () => {
    const padded = generatePaddedTone(0, 200, 500, sampleRate);
    const output = trimSilence([padded], sampleRate);
    expect(output[0]!.length).toBeLessThan(padded.length);
  });

  it("content in the middle is preserved", () => {
    const padded = generatePaddedTone(200, 500, 200, sampleRate);
    const output = trimSilence([padded], sampleRate);
    const toneLength = Math.floor((500 / 1000) * sampleRate);
    // Output should be at least as long as the tone portion
    expect(output[0]!.length).toBeGreaterThanOrEqual(toneLength - 100);
  });

  it("head/tail buffers are kept", () => {
    const padded = generatePaddedTone(500, 200, 500, sampleRate);
    const output = trimSilence([padded], sampleRate, {
      headMs: 50,
      tailMs: 50,
    });
    const headSamples = Math.floor((50 / 1000) * sampleRate);
    const toneLength = Math.floor((200 / 1000) * sampleRate);
    // Should be at least tone + head + tail
    expect(output[0]!.length).toBeGreaterThanOrEqual(
      toneLength + headSamples * 2 - 200,
    );
  });

  it("no-op if no significant silence", () => {
    // Generate a tone with no padding
    const tone = generatePaddedTone(0, 500, 0, sampleRate);
    const output = trimSilence([tone], sampleRate);
    // Should be roughly the same length
    expect(output[0]!.length).toBeGreaterThan(tone.length * 0.9);
  });
});

import { describe, expect, it } from "vitest";
import { decodeWav, encodeWav } from "../../src/codecs/wav";

describe("encodeWav / decodeWav", () => {
  it("round-trips samples within 16-bit quantization error", () => {
    const L = new Float32Array([0.0, 0.5, -0.5, 1.0, -1.0]);
    const R = new Float32Array([0.1, -0.1, 0.9, -0.9, 0.0]);
    const encoded = encodeWav([L, R], 44100);
    const decoded = decodeWav(encoded);

    expect(decoded.sampleRate).toBe(44100);
    expect(decoded.channels.length).toBe(2);
    expect(decoded.channels[0]!.length).toBe(5);
    expect(decoded.channels[1]!.length).toBe(5);

    const tolerance = 1 / 32768 + 1e-7; // 16-bit quantization error
    for (let i = 0; i < 5; i++) {
      expect(decoded.channels[0]![i]).toBeCloseTo(L[i]!, tolerance);
      expect(decoded.channels[1]![i]).toBeCloseTo(R[i]!, tolerance);
    }
  });

  it("writes correct RIFF/WAV header for mono", () => {
    const mono = new Float32Array([0.0, 0.25, -0.25]);
    const buf = encodeWav([mono], 48000);
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

    // "RIFF" magic
    expect(
      String.fromCharCode(
        view.getUint8(0),
        view.getUint8(1),
        view.getUint8(2),
        view.getUint8(3),
      ),
    ).toBe("RIFF");
    // File size - 8
    expect(view.getUint32(4, true)).toBe(buf.byteLength - 8);
    // "WAVE"
    expect(
      String.fromCharCode(
        view.getUint8(8),
        view.getUint8(9),
        view.getUint8(10),
        view.getUint8(11),
      ),
    ).toBe("WAVE");
    // "fmt "
    expect(
      String.fromCharCode(
        view.getUint8(12),
        view.getUint8(13),
        view.getUint8(14),
        view.getUint8(15),
      ),
    ).toBe("fmt ");
    // fmt chunk size = 16
    expect(view.getUint32(16, true)).toBe(16);
    // PCM format = 1
    expect(view.getUint16(20, true)).toBe(1);
    // 1 channel
    expect(view.getUint16(22, true)).toBe(1);
    // sample rate
    expect(view.getUint32(24, true)).toBe(48000);
    // byte rate = sampleRate * numChannels * 2
    expect(view.getUint32(28, true)).toBe(48000 * 1 * 2);
    // block align = numChannels * 2
    expect(view.getUint16(32, true)).toBe(2);
    // bits per sample = 16
    expect(view.getUint16(34, true)).toBe(16);
    // "data"
    expect(
      String.fromCharCode(
        view.getUint8(36),
        view.getUint8(37),
        view.getUint8(38),
        view.getUint8(39),
      ),
    ).toBe("data");
    // data size
    expect(view.getUint32(40, true)).toBe(3 * 1 * 2);
  });

  it("interleaves stereo samples as L/R/L/R", () => {
    const L = new Float32Array([0.5, -0.5]);
    const R = new Float32Array([0.25, -0.25]);
    const buf = encodeWav([L, R], 44100);
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

    // Read raw Int16 PCM starting at offset 44
    const s0 = view.getInt16(44, true); // L[0]
    const s1 = view.getInt16(46, true); // R[0]
    const s2 = view.getInt16(48, true); // L[1]
    const s3 = view.getInt16(50, true); // R[1]

    // L[0]=0.5 → ~16383, R[0]=0.25 → ~8191
    expect(s0).toBeGreaterThan(0);
    expect(s1).toBeGreaterThan(0);
    expect(s0).toBeGreaterThan(s1); // 0.5 > 0.25

    // L[1]=-0.5 → ~-16384, R[1]=-0.25 → ~-8192
    expect(s2).toBeLessThan(0);
    expect(s3).toBeLessThan(0);
    expect(s2).toBeLessThan(s3); // -0.5 < -0.25
  });

  it("rejects non-WAV data", () => {
    const garbage = Buffer.from([
      0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
    ]);
    expect(() => decodeWav(garbage)).toThrow("Invalid WAV file");
  });

  it("produces correct output size", () => {
    const numSamples = 100;
    const numChannels = 2;
    const L = new Float32Array(numSamples);
    const R = new Float32Array(numSamples);
    const buf = encodeWav([L, R], 44100);

    expect(buf.byteLength).toBe(44 + numSamples * numChannels * 2);
  });
});

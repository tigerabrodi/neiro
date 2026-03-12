import { describe, expect, it } from "vitest";
import { decodePcm } from "../../src/codecs/pcm";

function encodePcmS16le(channels: Int16Array[]): Buffer {
  const numChannels = channels.length;
  const numFrames = channels[0]?.length ?? 0;
  const buffer = Buffer.alloc(numFrames * numChannels * 2);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  let offset = 0;
  for (let i = 0; i < numFrames; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      view.setInt16(offset, channels[ch]![i]!, true);
      offset += 2;
    }
  }

  return buffer;
}

describe("decodePcm", () => {
  it("decodes mono s16le PCM correctly", () => {
    const decoded = decodePcm({
      buffer: encodePcmS16le([new Int16Array([0, 16384, -16384])]),
      sampleRate: 44100,
    });

    expect(decoded.channels.length).toBe(1);
    expect(Array.from(decoded.channels[0]!)).toEqual([0, 0.5, -0.5]);
  });

  it("decodes stereo interleaved s16le PCM correctly", () => {
    const decoded = decodePcm({
      buffer: encodePcmS16le([
        new Int16Array([32767, 0, -32768]),
        new Int16Array([0, -16384, 16384]),
      ]),
      sampleRate: 48000,
      channels: 2,
    });

    expect(decoded.channels.length).toBe(2);
    expect(decoded.channels[0]![0]).toBeCloseTo(32767 / 32768, 7);
    expect(decoded.channels[0]![1]).toBe(0);
    expect(decoded.channels[0]![2]).toBe(-1);
    expect(decoded.channels[1]![0]).toBe(0);
    expect(decoded.channels[1]![1]).toBe(-0.5);
    expect(decoded.channels[1]![2]).toBe(0.5);
  });

  it("throws when byte length is not frame-aligned", () => {
    expect(() =>
      decodePcm({
        buffer: Buffer.from([0x00, 0x01, 0x02]),
        sampleRate: 48000,
      }),
    ).toThrow("PCM buffer length must be divisible by frame size");
  });

  it("preserves sampleRate", () => {
    const decoded = decodePcm({
      buffer: encodePcmS16le([new Int16Array([0, 1, -1])]),
      sampleRate: 48000,
    });

    expect(decoded.sampleRate).toBe(48000);
  });

  it("maps signed 16-bit boundaries into normalized floats", () => {
    const decoded = decodePcm({
      buffer: encodePcmS16le([new Int16Array([0, 32767, -32768])]),
      sampleRate: 44100,
    });

    expect(decoded.channels[0]![0]).toBe(0);
    expect(decoded.channels[0]![1]).toBeCloseTo(32767 / 32768, 7);
    expect(decoded.channels[0]![2]).toBe(-1);
  });

  it("rejects non-positive sample rates", () => {
    expect(() =>
      decodePcm({
        buffer: Buffer.alloc(0),
        sampleRate: 0,
      }),
    ).toThrow("Sample rate must be positive");
  });

  it("returns zero-length channel data for an empty frame-aligned buffer", () => {
    const decoded = decodePcm({
      buffer: Buffer.alloc(0),
      sampleRate: 48000,
      channels: 2,
    });

    expect(decoded.sampleRate).toBe(48000);
    expect(decoded.channels.length).toBe(2);
    expect(decoded.channels[0]!.length).toBe(0);
    expect(decoded.channels[1]!.length).toBe(0);
  });
});

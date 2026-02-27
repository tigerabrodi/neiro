import { describe, expect, it } from "vitest";
import { decodeMp3, encodeMp3 } from "../../src/codecs/mp3";

function generateSineWave(
  frequency: number,
  durationMs: number,
  sampleRate: number,
  amplitude: number = 1.0,
): Float32Array {
  const numSamples = Math.floor((durationMs / 1000) * sampleRate);
  const samples = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    samples[i] =
      amplitude * Math.sin(2 * Math.PI * frequency * (i / sampleRate));
  }
  return samples;
}

function rms(a: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i]! * a[i]!;
  }
  return Math.sqrt(sum / a.length);
}

describe("encodeMp3 / decodeMp3", () => {
  it("round-trips with approximate waveform similarity", async () => {
    const sampleRate = 44100;
    const sine = generateSineWave(440, 500, sampleRate, 0.8);
    const encoded = encodeMp3([sine], sampleRate);
    const decoded = await decodeMp3(encoded);

    expect(decoded.channels.length).toBeGreaterThanOrEqual(1);
    expect(decoded.sampleRate).toBe(sampleRate);

    // MP3 is lossy — compare RMS levels rather than exact samples.
    // The decoded signal should have similar energy to the original.
    const originalRms = rms(sine);
    const decodedRms = rms(decoded.channels[0]!);
    expect(decodedRms).toBeGreaterThan(originalRms * 0.5);
    expect(decodedRms).toBeLessThan(originalRms * 1.5);
  });

  it("encoded buffer starts with MP3 sync word or ID3 header", () => {
    const sampleRate = 44100;
    const sine = generateSineWave(440, 200, sampleRate);
    const encoded = encodeMp3([sine], sampleRate);

    // MP3 frame sync: 0xFF 0xFB (or 0xFF 0xE*-0xFF)
    // ID3 header: "ID3"
    const firstByte = encoded[0]!;
    const secondByte = encoded[1]!;
    const isMP3Sync = firstByte === 0xff && (secondByte & 0xe0) === 0xe0;
    const isID3 =
      encoded[0] === 0x49 && encoded[1] === 0x44 && encoded[2] === 0x33;

    expect(isMP3Sync || isID3).toBe(true);
  });

  it("mono encoding works", async () => {
    const sampleRate = 44100;
    const sine = generateSineWave(440, 300, sampleRate);
    const encoded = encodeMp3([sine], sampleRate);
    const decoded = await decodeMp3(encoded);

    expect(decoded.channels.length).toBeGreaterThanOrEqual(1);
    expect(rms(decoded.channels[0]!)).toBeGreaterThan(0);
  });

  it("stereo encoding works", async () => {
    const sampleRate = 44100;
    const left = generateSineWave(440, 300, sampleRate, 0.8);
    const right = generateSineWave(880, 300, sampleRate, 0.6);
    const encoded = encodeMp3([left, right], sampleRate);
    const decoded = await decodeMp3(encoded);

    expect(decoded.channels.length).toBe(2);
    expect(rms(decoded.channels[0]!)).toBeGreaterThan(0);
    expect(rms(decoded.channels[1]!)).toBeGreaterThan(0);
  });

  it("default bitrate is 128", () => {
    const sampleRate = 44100;
    const sine = generateSineWave(440, 500, sampleRate);
    const defaultEncoded = encodeMp3([sine], sampleRate);
    const explicit128 = encodeMp3([sine], sampleRate, 128);

    // Same bitrate should produce same size (within a frame or two)
    expect(Math.abs(defaultEncoded.byteLength - explicit128.byteLength)).toBeLessThan(1000);
  });
});

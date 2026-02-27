import { decodeMp3, encodeMp3 } from "./codecs/mp3";
import { decodeWav, encodeWav } from "./codecs/wav";
import { calculateIntegratedLoudness } from "./dsp/lufs";
import { measureTruePeak } from "./dsp/true-peak";
import { concatChannels } from "./transforms/concat";
import { applyFadeIn, applyFadeOut } from "./transforms/fade";
import { applyGain } from "./transforms/gain";
import { mixChannels } from "./transforms/mix";
import { normalizeLoudness } from "./transforms/normalize";
import { reverseChannels } from "./transforms/reverse";
import { sliceChannels } from "./transforms/slice";
import { changeSpeed } from "./transforms/speed";
import { trimSilence as trimSilenceTransform } from "./transforms/trim-silence";

export class AudioTrack {
  private readonly _channels: Float32Array[];
  private readonly _sampleRate: number;

  private constructor(channels: Float32Array[], sampleRate: number) {
    this._channels = channels;
    this._sampleRate = sampleRate;
  }

  // --- Construction ---

  static async fromBuffer({ buffer }: { buffer: Buffer }): Promise<AudioTrack> {
    // Sniff format: WAV starts with "RIFF"
    if (
      buffer.length >= 4 &&
      buffer[0] === 0x52 && // R
      buffer[1] === 0x49 && // I
      buffer[2] === 0x46 && // F
      buffer[3] === 0x46 // F
    ) {
      const { channels, sampleRate } = decodeWav(buffer);
      return new AudioTrack(channels, sampleRate);
    }

    // Fall back to MP3 decode
    const { channels, sampleRate } = await decodeMp3(buffer);
    return new AudioTrack(channels, sampleRate);
  }

  static fromChannels({
    channels,
    sampleRate,
  }: {
    channels: Float32Array[];
    sampleRate: number;
  }): AudioTrack {
    return new AudioTrack(channels, sampleRate);
  }

  static silence({
    durationMs,
    sampleRate = 44100,
    channels = 1,
  }: {
    durationMs: number;
    sampleRate?: number;
    channels?: number;
  }): AudioTrack {
    const numSamples = Math.floor((durationMs / 1000) * sampleRate);
    const chans: Float32Array[] = [];
    for (let i = 0; i < channels; i++) {
      chans.push(new Float32Array(numSamples));
    }
    return new AudioTrack(chans, sampleRate);
  }

  // --- Properties ---

  get duration(): number {
    return this._channels[0]!.length / this._sampleRate;
  }

  get sampleRate(): number {
    return this._sampleRate;
  }

  get channels(): number {
    return this._channels.length;
  }

  get length(): number {
    return this._channels[0]!.length;
  }

  // --- Measurement ---

  loudness(): number {
    return calculateIntegratedLoudness(this._channels, this._sampleRate);
  }

  truePeak(): number {
    let peak = 0;
    for (const ch of this._channels) {
      const p = measureTruePeak(ch, this._sampleRate);
      if (p > peak) peak = p;
    }
    return peak;
  }

  rms(): number {
    let sumSquares = 0;
    let totalSamples = 0;
    for (const ch of this._channels) {
      for (let i = 0; i < ch.length; i++) {
        sumSquares += ch[i]! * ch[i]!;
      }
      totalSamples += ch.length;
    }
    return Math.sqrt(sumSquares / totalSamples);
  }

  getChannel({ index }: { index: number }): Float32Array {
    if (index < 0 || index >= this._channels.length) {
      throw new Error(
        `Channel index ${index} out of bounds (0–${this._channels.length - 1})`,
      );
    }
    return Float32Array.from(this._channels[index]!);
  }

  // --- Transforms (each returns a new AudioTrack) ---

  gain({ db }: { db: number }): AudioTrack {
    return new AudioTrack(applyGain(this._channels, db), this._sampleRate);
  }

  normalize(opts?: { target?: number; peakLimit?: number }): AudioTrack {
    return new AudioTrack(
      normalizeLoudness(this._channels, this._sampleRate, opts),
      this._sampleRate,
    );
  }

  trimSilence(opts?: {
    threshold?: number;
    headMs?: number;
    tailMs?: number;
  }): AudioTrack {
    return new AudioTrack(
      trimSilenceTransform(this._channels, this._sampleRate, opts),
      this._sampleRate,
    );
  }

  fadeIn({ ms }: { ms: number }): AudioTrack {
    return new AudioTrack(
      applyFadeIn(this._channels, this._sampleRate, ms),
      this._sampleRate,
    );
  }

  fadeOut({ ms }: { ms: number }): AudioTrack {
    return new AudioTrack(
      applyFadeOut(this._channels, this._sampleRate, ms),
      this._sampleRate,
    );
  }

  slice({ startMs, endMs }: { startMs: number; endMs?: number }): AudioTrack {
    return new AudioTrack(
      sliceChannels(this._channels, this._sampleRate, startMs, endMs),
      this._sampleRate,
    );
  }

  concat({ other }: { other: AudioTrack }): AudioTrack {
    if (this._channels.length !== other._channels.length) {
      throw new Error(
        `Channel count mismatch: ${this._channels.length} vs ${other._channels.length}`,
      );
    }
    return new AudioTrack(
      concatChannels(this._channels, other._channels),
      this._sampleRate,
    );
  }

  mix({ other, gainDb }: { other: AudioTrack; gainDb?: number }): AudioTrack {
    return new AudioTrack(
      mixChannels(this._channels, other._channels, gainDb),
      this._sampleRate,
    );
  }

  reverse(): AudioTrack {
    return new AudioTrack(reverseChannels(this._channels), this._sampleRate);
  }

  speed({ rate }: { rate: number }): AudioTrack {
    return new AudioTrack(changeSpeed(this._channels, rate), this._sampleRate);
  }

  // --- Export ---

  toWav(): Buffer {
    return encodeWav(this._channels, this._sampleRate);
  }

  toMp3(opts?: { bitrate?: number }): Buffer {
    return encodeMp3(this._channels, this._sampleRate, opts?.bitrate);
  }

  toPcm(): { channels: Float32Array[]; sampleRate: number } {
    return {
      channels: this._channels.map((ch) => Float32Array.from(ch)),
      sampleRate: this._sampleRate,
    };
  }
}

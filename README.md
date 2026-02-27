# neiro 音色

Audio processing for TypeScript. Chainable, immutable, serverless-ready.

neiro (音色, "tone color") is a TypeScript library for processing audio on the server. Loudness normalization, true peak limiting, silence trimming, fades, slicing, and more — all through a clean, chainable API.

Runs anywhere: Node.js, Vercel, Cloudflare Workers, any serverless runtime.

## Install

```bash
bun add neiro
# or
npm install neiro
```

## Quick Start

```typescript
import { AudioTrack } from "neiro";
import { readFileSync, writeFileSync } from "fs";

const buffer = readFileSync("input.mp3");
const track = await AudioTrack.fromBuffer({ buffer });

// Normalize loudness, trim silence, fade out
const result = track
  .normalize({ target: -14 })
  .trimSilence()
  .fadeOut({ ms: 10 });

writeFileSync("output.mp3", result.toMp3());
```

## Why

Audio files from different sources come in at wildly different volumes, with padding, with clipping. Fixing this usually means reaching for ffmpeg (heavy, binary dependency) or cobbling together multiple npm packages.

neiro gives you a single, typed API that handles the common cases. The DSP internals (ITU-R BS.1770-4 loudness, true peak detection via 4x oversampling, K-weighting filters) are implemented in TypeScript — no WASM, no native binaries, no ffmpeg.

Two small runtime dependencies handle MP3 codec work: `lamejs` for encoding and `audio-decode` for decoding. Everything else is hand-written TypeScript.

## API at a Glance

Every method takes a single object argument — you always know what each value means, and you get full autocomplete.

```typescript
// Load
const track = await AudioTrack.fromBuffer({ buffer: mp3OrWavBuffer });
const track = AudioTrack.fromChannels({
  channels: [leftSamples],
  sampleRate: 44100,
});
const track = AudioTrack.silence({ durationMs: 500 });

// Measure
track.loudness(); // Integrated LUFS (ITU-R BS.1770-4)
track.truePeak(); // True peak in dBTP (4x oversampled)
track.rms(); // RMS level in dB
track.duration; // Seconds
track.sampleRate; // Hz
track.channels; // 1 (mono) or 2 (stereo)

// Transform (each returns a new AudioTrack — immutable)
track.normalize({ target: -14, peakLimit: -1.5 });
track.trimSilence({ threshold: -30, headMs: 10, tailMs: 50 });
track.gain({ db: 6 }); // +6 dB
track.fadeIn({ ms: 5 }); // 5ms fade-in
track.fadeOut({ ms: 10 }); // 10ms fade-out
track.slice({ startMs: 0, endMs: 2000 }); // First 2 seconds
track.concat({ other }); // Join end-to-end
track.mix({ other }); // Overlay
track.reverse();
track.speed({ rate: 1.5 }); // 1.5x speed (no pitch preservation)

// Export
track.toMp3({ bitrate: 128 }); // Buffer
track.toWav(); // Buffer
track.toPcm(); // { channels: Float32Array[], sampleRate }
```

All transforms chain:

```typescript
const output = track
  .normalize({ target: -20 })
  .fadeIn({ ms: 500 })
  .fadeOut({ ms: 2000 })
  .toMp3({ bitrate: 192 });
```

## Examples

### Normalize a sound effect

```typescript
const sfx = await AudioTrack.fromBuffer({ buffer: raw });
const processed = sfx
  .normalize({ target: -14, peakLimit: -1.5 })
  .trimSilence()
  .fadeIn({ ms: 5 })
  .fadeOut({ ms: 10 });
const output = processed.toMp3();
```

### Prepare background music

```typescript
const music = await AudioTrack.fromBuffer({ buffer: raw });
const processed = music
  .normalize({ target: -20 })
  .fadeIn({ ms: 500 })
  .fadeOut({ ms: 2000 });
const output = processed.toMp3({ bitrate: 192 });
```

### Analyze loudness

```typescript
const track = await AudioTrack.fromBuffer({ buffer });
console.log(`Loudness: ${track.loudness()} LUFS`);
console.log(`True peak: ${track.truePeak()} dBTP`);
console.log(`Duration: ${track.duration}s`);
```

### Build a sequence

```typescript
const beep = await AudioTrack.fromBuffer({ buffer: beepMp3 });
const gap = AudioTrack.silence({
  durationMs: 300,
  sampleRate: beep.sampleRate,
});
const sequence = beep
  .concat({ other: gap })
  .concat({ other: beep })
  .concat({ other: gap })
  .concat({ other: beep });
const output = sequence.toWav();
```

## What's Inside

The DSP is hand-written TypeScript implementing broadcast standards:

- **Loudness measurement**: ITU-R BS.1770-4 / EBU R128 with K-weighting, 400ms gated blocks, dual gating (absolute at -70 LUFS, relative at -10 LU)
- **True peak detection**: 4x oversampling via polyphase FIR interpolation with Kaiser-windowed sinc filter — catches intersample peaks that sample-level detection misses
- **True peak limiting**: Stereo-matched gain reduction to preserve stereo image
- **Silence detection**: Windowed RMS scanning (not sample-level) for robust detection that ignores brief transients

## Defaults

| Parameter               | Default   | Why                             |
| ----------------------- | --------- | ------------------------------- |
| `normalize.target`      | -14 LUFS  | EBU R128 foreground standard    |
| `normalize.peakLimit`   | -1.5 dBTP | Headroom for DAC reconstruction |
| `trimSilence.threshold` | -30 dB    | Catches low-level padding noise |
| `trimSilence.headMs`    | 10 ms     | Preserves natural attack        |
| `trimSilence.tailMs`    | 50 ms     | Preserves natural decay         |
| `toMp3.bitrate`         | 128 kbps  | Good quality/size balance       |

## Docs

- [API Reference](./API.md) — Full API documentation with all methods, options, and examples
- [Development Guide](./DEVELOPMENT.md) — How to build this library from scratch with TDD
- [Release Guide](./RELEASE.md) — How to package and publish to npm

## License

MIT

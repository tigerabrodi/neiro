# neiro 音色

Audio processing for TypeScript. Chainable, immutable, serverless-ready.

neiro (音色, "tone color") is a TypeScript library for processing audio on the server. Loudness normalization, true peak limiting, silence trimming, fades, slicing, and more — all through a clean, chainable API.

Runs anywhere: Node.js, Vercel, Cloudflare Workers, any serverless runtime.

## Install

```bash
bun add @tigerabrodioss/neiro
# or
npm install @tigerabrodioss/neiro
```

## Quick Start

```typescript
import { AudioTrack } from "@tigerabrodioss/neiro";
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

For raw `pcm_48000` one-shot SFX, use `fromPcm()` and export WAV directly:

```typescript
const pcm = readFileSync("input.pcm");
const track = AudioTrack.fromPcm({
  buffer: pcm,
  sampleRate: 48000,
  channels: 1,
  format: "s16le",
});

writeFileSync("output.wav", track.toWav());
```

## Why

Audio files from different sources come in at wildly different volumes, with padding, with clipping. Fixing this usually means reaching for ffmpeg (heavy, binary dependency) or cobbling together multiple npm packages.

neiro gives you a single, typed API that handles the common cases. The DSP internals (ITU-R BS.1770-4 loudness, true peak detection via 4x oversampling, K-weighting filters) are implemented in TypeScript — no WASM, no native binaries, no ffmpeg.

Two small runtime dependencies handle MP3 codec work: `lamejs` for encoding and `audio-decode` for decoding. Everything else is hand-written TypeScript.

## API at a Glance

Methods that take options use a single object argument, while no-arg methods like `reverse()`, `toMono()`, and `toStereo()` stay no-arg.

```typescript
// Load
const track = await AudioTrack.fromBuffer({ buffer: mp3OrWavBuffer });
const track = AudioTrack.fromPcm({
  buffer: pcmBuffer,
  sampleRate: 48000,
  channels: 1,
  format: "s16le",
});
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
track.channels; // Channel count

// Transform (each returns a new AudioTrack — immutable)
track.normalize({ target: -14, peakLimit: -1.5 });
track.trimSilence({ thresholdDb: -30, headMs: 10, tailMs: 50 });
track.gain({ db: 6 }); // +6 dB
track.fadeIn({ ms: 5 }); // 5ms fade-in
track.fadeOut({ ms: 10 }); // 10ms fade-out
track.slice({ startMs: 0, endMs: 2000 }); // First 2 seconds
track.resample({ sampleRate: 48000 }); // Change sample rate explicitly
track.toMono(); // Downmix by averaging channels
track.toStereo(); // Mono -> stereo, or downmix multi-channel then duplicate
track.concat({ other }); // Join end-to-end
track.mix({ other }); // Overlay
track.reverse();
track.speed({ rate: 1.5 }); // 1.5x speed (no pitch preservation)

// Export
track.toMp3({ bitrate: 128 }); // Buffer
track.toWav(); // Buffer
track.toPcm(); // { channels: Float32Array[], sampleRate }
```

`fromBuffer()` does not sniff raw PCM. Raw PCM has no header, so use `fromPcm()` when you already know the sample format.

`trimSilence()` uses internal 10ms RMS analysis windows, with defaults of `thresholdDb: -30`, `headMs: 10`, and `tailMs: 50`. It trims based on window loudness rather than individual sample peaks, which makes it more stable around brief transients.

`concat()` and `mix()` stay strict. They do not resample or convert channel layouts implicitly, so use `toMono()`, `toStereo()`, and `resample()` when you need to normalize tracks intentionally first.

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
  .fadeOut({ ms: 10 });
const output = processed.toMp3();
```

### Ingest raw PCM for a one-shot SFX

```typescript
const track = AudioTrack.fromPcm({
  buffer: pcm,
  sampleRate: 48000,
  channels: 1,
  format: "s16le",
});

const wav = track.toWav();
```

This is the intended `pcm_48000` path for short one-shot assets. Keep everything at 48 kHz end-to-end, and only `concat()` or `mix()` tracks that already share the same sample rate and channel count.

### Prepare background music

```typescript
const music = await AudioTrack.fromBuffer({ buffer: raw });
const processed = music
  .normalize({ target: -20 })
  .fadeIn({ ms: 500 })
  .fadeOut({ ms: 2000 });
const output = processed.toMp3({ bitrate: 192 });
```

### Normalize formats before concat or mix

```typescript
const normalized = track
  .toStereo()
  .resample({ sampleRate: 48000 });

const padded = AudioTrack.silence({
  durationMs: 500,
  sampleRate: normalized.sampleRate,
  channels: normalized.channels,
}).concat({ other: normalized });
```

`toStereo()` uses a simple downmix-to-mono-then-duplicate rule for inputs with more than 2 channels.

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
  channels: beep.channels,
});
const sequence = beep
  .concat({ other: gap })
  .concat({ other: beep })
  .concat({ other: gap })
  .concat({ other: beep });
const output = sequence.toWav();
```

## License

MIT

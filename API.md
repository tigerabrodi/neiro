# neiro — API Reference (v1)

Audio processing for TypeScript. Chainable, immutable, serverless-ready.

## Core Concept

Everything revolves around `AudioTrack` — an immutable object holding PCM audio data. You create one from a buffer, transform it with chainable methods, and export the result.

```typescript
import { AudioTrack } from "neiro";

const track = await AudioTrack.fromBuffer({ buffer: mp3Buffer });

const result = track
  .normalize({ target: -14 })
  .trimSilence()
  .fadeOut({ ms: 10 });

const output = result.toMp3({ bitrate: 128 });
```

Methods that take options use a single object argument. No-arg methods like `reverse()`, `toMono()`, and `toStereo()` stay no-arg.

Every transform returns a **new** `AudioTrack`. The original is never mutated.

---

## Construction

### `AudioTrack.fromBuffer({ buffer })`

Decode a compressed audio buffer (MP3, WAV, OGG, FLAC) into an `AudioTrack`.

```typescript
const track = await AudioTrack.fromBuffer({
  buffer: Buffer;
}): Promise<AudioTrack>
```

This is async because decoding compressed audio requires parsing frame headers, Huffman tables, etc. Format is auto-detected from the buffer contents.

Raw PCM is **not** auto-detected here. Raw PCM has no container header, so use `AudioTrack.fromPcm()` when you have `s16le` bytes.

```typescript
const track = await AudioTrack.fromBuffer({ buffer });
```

### `AudioTrack.fromPcm({ buffer, sampleRate, channels?, format? })`

Create an `AudioTrack` from raw interleaved PCM bytes.

```typescript
const track = AudioTrack.fromPcm({
  buffer: Buffer;
  sampleRate: number;
  channels?: number;      // default: 1
  format?: "s16le";       // default: "s16le"
}): AudioTrack
```

v1 supports only signed 16-bit little-endian PCM (`"s16le"`), with mono or stereo channel layouts. The PCM is assumed to be interleaved.

```typescript
const track = AudioTrack.fromPcm({
  buffer: pcm,
  sampleRate: 48000,
  channels: 1,
  format: "s16le",
});

const wav = track.toWav();
```

### `AudioTrack.fromChannels({ channels, sampleRate })`

Create an `AudioTrack` from already-decoded normalized sample arrays. Use this when you already have floating-point PCM data.

```typescript
const track = AudioTrack.fromChannels({
  channels: Float32Array[];  // One Float32Array per channel
  sampleRate: number;
}): AudioTrack
```

Samples must be normalized to the `-1.0` to `1.0` range.

```typescript
// Mono track from raw samples
const mono = AudioTrack.fromChannels({
  channels: [samples],
  sampleRate: 44100,
});

// Stereo track
const stereo = AudioTrack.fromChannels({
  channels: [left, right],
  sampleRate: 48000,
});
```

### `AudioTrack.silence({ durationMs, ... })`

Generate a silent track. Useful as a building block with `concat()` and `mix()`.

```typescript
const gap = AudioTrack.silence({
  durationMs: number;
  sampleRate?: number;  // default: 44100
  channels?: number;    // default: 1
}): AudioTrack
```

```typescript
// 500ms of silence
const gap = AudioTrack.silence({ durationMs: 500 });

// 1 second of stereo silence at 48kHz
const gap = AudioTrack.silence({
  durationMs: 1000,
  sampleRate: 48000,
  channels: 2,
});
```

---

## Properties

Read-only properties on every `AudioTrack` instance.

| Property     | Type     | Description                            |
| ------------ | -------- | -------------------------------------- |
| `duration`   | `number` | Duration in seconds                    |
| `sampleRate` | `number` | Sample rate in Hz (e.g., 44100, 48000) |
| `channels`   | `number` | Channel count                          |
| `length`     | `number` | Total samples per channel              |

```typescript
const track = await AudioTrack.fromBuffer({ buffer: mp3Buffer });
track.duration; // 4.2
track.sampleRate; // 44100
track.channels; // 2
track.length; // 185220
```

---

## Measurement

Methods that analyze the audio without modifying it. These take no arguments.

### `track.loudness()`

Measure integrated loudness per ITU-R BS.1770-4 / EBU R128.

```typescript
track.loudness(): number  // LUFS
```

Returns the integrated loudness in LUFS (Loudness Units relative to Full Scale). Returns `-Infinity` for silence or audio shorter than 400ms (the minimum block size for LUFS measurement).

The measurement applies K-weighting (a frequency curve that models human loudness perception) and dual gating (absolute gate at -70 LUFS, relative gate at -10 LU below the ungated mean).

```typescript
track.loudness(); // -22.3
```

### `track.truePeak()`

Measure true peak level using 4x oversampling per ITU-R BS.1770-4.

```typescript
track.truePeak(): number  // dBTP (decibels true peak)
```

True peak detection uses polyphase FIR interpolation to find intersample peaks — values that occur between samples when a DAC reconstructs the analog signal. This is more accurate than simply finding the loudest sample.

Returns the maximum true peak across all channels in dBTP.

```typescript
track.truePeak(); // -0.8
```

### `track.rms()`

Measure RMS (Root Mean Square) level.

```typescript
track.rms(): number  // dB
```

RMS represents the average power of the signal — a rough proxy for perceived loudness (less accurate than LUFS, but faster to compute and doesn't require a minimum duration).

Returns the RMS level in dB across all channels.

```typescript
track.rms(); // -18.5
```

### `track.getChannel({ index })`

Access raw PCM samples for a specific channel.

```typescript
track.getChannel({ index: number }): Float32Array
```

Returns a **copy** of the channel data (the track remains immutable).

- `0` = left (or mono)
- `1` = right

Throws if the index is out of range.

```typescript
const leftSamples = track.getChannel({ index: 0 });
const rightSamples = track.getChannel({ index: 1 });
```

---

## Transforms

Every transform returns a new `AudioTrack`. They can be chained. Methods that take options use a single object argument.

### `track.gain({ db })`

Apply gain (volume adjustment) in decibels.

```typescript
track.gain({ db: number }): AudioTrack
```

Positive values boost, negative values attenuate. No clipping protection — use `normalize()` if you need peak limiting.

```typescript
track.gain({ db: 6 }); // +6 dB (roughly doubles perceived loudness)
track.gain({ db: -3 }); // -3 dB (roughly halves power)
```

### `track.normalize({ target?, peakLimit? })`

Normalize loudness to a target LUFS with true peak limiting.

```typescript
track.normalize({
  target?: number;     // Target LUFS (default: -14)
  peakLimit?: number;  // True peak ceiling in dBTP (default: -1.5)
}): AudioTrack
```

This is the main workhorse for loudness normalization:

1. Measures current integrated loudness (LUFS)
2. Calculates the gain needed to reach `target`
3. Applies gain
4. If true peak exceeds `peakLimit`, applies stereo-matched gain reduction

The stereo-matched limiting is important: both channels get the same gain reduction so the stereo image isn't distorted.

Returns the original track unchanged if loudness is `-Infinity` (silence/too short).

```typescript
// Broadcast standard (-14 LUFS, -1.5 dBTP ceiling)
track.normalize();

// Quieter background audio
track.normalize({ target: -20 });

// Tighter peak control
track.normalize({ target: -14, peakLimit: -1.0 });
```

### `track.trimSilence({ thresholdDb?, headMs?, tailMs? })`

Remove leading and trailing silence.

```typescript
track.trimSilence({
  thresholdDb?: number;  // Silence threshold in dB RMS (default: -30)
  headMs?: number;       // Buffer to keep before content (default: 10)
  tailMs?: number;       // Buffer to keep after content (default: 50)
}): AudioTrack
```

Uses fixed 10ms RMS analysis windows internally instead of sample-level detection. Each window is analyzed per channel, and the loudest channel RMS decides whether that window counts as content.

- **Leading trim**: Scans forward with the configured threshold. Keeps `headMs` of buffer before the first loud window for a natural attack.
- **Trailing trim**: Scans backward with the configured threshold. Keeps `tailMs` of buffer after the last loud window for natural decay.

Returns the original track unchanged if no analysis window crosses the threshold.

```typescript
// Sensible defaults
track.trimSilence();

// More aggressive leading trim
track.trimSilence({ thresholdDb: -20, headMs: 5 });

// Keep more tail for reverb
track.trimSilence({ tailMs: 200 });
```

### `track.fadeIn({ ms })`

Apply a linear fade-in from silence.

```typescript
track.fadeIn({ ms: number }): AudioTrack
```

Ramps gain from 0 to 1 over the specified duration. Use it when you need a short cleanup fade after an aggressive trim or when you want an audible fade-in effect.

```typescript
track.fadeIn({ ms: 5 }); // Optional short cleanup fade
track.fadeIn({ ms: 500 }); // 500ms fade-in (artistic)
```

### `track.fadeOut({ ms })`

Apply a linear fade-out to silence.

```typescript
track.fadeOut({ ms: number }): AudioTrack
```

Ramps gain from 1 to 0 over the specified duration at the end of the track.

```typescript
track.fadeOut({ ms: 10 }); // 10ms fade-out (click prevention)
track.fadeOut({ ms: 2000 }); // 2 second fade-out (song ending)
```

### `track.slice({ startMs, endMs? })`

Extract a segment of the track.

```typescript
track.slice({
  startMs: number;
  endMs?: number;  // Defaults to end of track
}): AudioTrack
```

Returns a new track containing only the audio between `startMs` and `endMs`.

```typescript
// First 2 seconds
track.slice({ startMs: 0, endMs: 2000 });

// Everything after the first second
track.slice({ startMs: 1000 });

// A 500ms segment starting at 3 seconds
track.slice({ startMs: 3000, endMs: 3500 });
```

### `track.resample({ sampleRate })`

Explicitly resample the track to a new sample rate.

```typescript
track.resample({
  sampleRate: number;
}): AudioTrack
```

Uses linear interpolation in v1. Preserves channel count and preserves duration as closely as possible. Resampling to the same sample rate still returns a new copied track.

Throws `resample sampleRate must be a finite positive number` if `sampleRate` is not finite or is less than or equal to zero.

```typescript
const resampled = track.resample({ sampleRate: 48000 });
```

### `track.toMono()`

Downmix the track to mono. Takes no arguments.

```typescript
track.toMono(): AudioTrack
```

Averages all channels equally per frame. Works for mono, stereo, and multi-channel inputs. Mono input still returns a new copied mono track.

```typescript
const mono = track.toMono();
```

### `track.toStereo()`

Convert the track to stereo. Takes no arguments.

```typescript
track.toStereo(): AudioTrack
```

- Mono input: duplicates the mono channel into left and right.
- Stereo input: returns a new copied stereo track.
- More than 2 channels: first downmixes to mono with the same averaging rule as `toMono()`, then duplicates into stereo.

```typescript
const stereo = track.toStereo();
```

### `track.concat({ other })`

Join two tracks end-to-end.

```typescript
track.concat({ other: AudioTrack }): AudioTrack
```

The tracks must have the same sample rate and channel count. Throws if they don't match. `concat()` does not resample or convert channels implicitly.

```typescript
const intro = await AudioTrack.fromBuffer({ buffer: introMp3 });
const body = await AudioTrack.fromBuffer({ buffer: bodyMp3 });
const full = intro.concat({ other: body });
```

Throws `Cannot concat tracks with different sample rates` or `Cannot concat tracks with different channel counts` if the tracks are incompatible.

### `track.mix({ other, gainDb? })`

Mix (overlay) another track on top of this one.

```typescript
track.mix({
  other: AudioTrack;
  gainDb?: number;  // Gain applied to `other` before mixing (default: 0)
}): AudioTrack
```

Adds the samples together. The output length is the longer of the two tracks. The tracks must have the same sample rate and channel count. `mix()` does not resample or convert channels implicitly.

```typescript
// Layer background ambience under dialogue
const dialogue = await AudioTrack.fromBuffer({ buffer: dialogueMp3 });
const ambience = await AudioTrack.fromBuffer({ buffer: ambienceMp3 });
const mixed = dialogue.mix({ other: ambience, gainDb: -6 });
```

Throws `Cannot mix tracks with different sample rates` or `Cannot mix tracks with different channel counts` if the tracks are incompatible.

### `track.reverse()`

Reverse the audio. Takes no arguments.

```typescript
track.reverse(): AudioTrack
```

```typescript
const reversed = track.reverse();
```

### `track.speed({ rate })`

Change playback speed by resampling. Does not preserve pitch.

```typescript
track.speed({ rate: number }): AudioTrack
```

`rate > 1` = faster and higher pitched. `rate < 1` = slower and lower pitched. Uses linear interpolation for resampling.

The output sample rate stays the same — the duration changes.

```typescript
track.speed({ rate: 2 }); // Double speed, half duration, octave up
track.speed({ rate: 0.5 }); // Half speed, double duration, octave down
track.speed({ rate: 1.5 }); // 1.5x speed
```

---

## Export

### `track.toMp3({ bitrate? })`

Encode the track to MP3.

```typescript
track.toMp3({
  bitrate?: number;  // kbps (default: 128)
}): Buffer
```

```typescript
const mp3 = track.toMp3(); // 128 kbps
const hq = track.toMp3({ bitrate: 320 }); // 320 kbps
```

### `track.toWav()`

Encode the track to WAV (16-bit PCM). Takes no arguments.

```typescript
track.toWav(): Buffer
```

WAV is lossless and trivial to parse. Use this when you need an interchange format or when quality matters more than file size.

```typescript
const wav = track.toWav();
```

### `track.toPcm()`

Get the raw PCM data and metadata. Takes no arguments.

```typescript
track.toPcm(): {
  channels: Float32Array[];
  sampleRate: number;
}
```

Returns copies of the internal channel arrays. Use this when you want to feed the data into another system.

```typescript
const { channels, sampleRate } = track.toPcm();
// channels[0] = left/mono, channels[1] = right (if stereo)
```

---

## Chaining Examples

### Normalize a sound effect for a game

```typescript
const sfx = await AudioTrack.fromBuffer({ buffer: raw });

const processed = sfx
  .normalize({ target: -14, peakLimit: -1.5 })
  .trimSilence({ thresholdDb: -30, headMs: 10, tailMs: 50 })
  .fadeOut({ ms: 10 });

const output = processed.toMp3({ bitrate: 128 });
```

### Convert raw PCM into WAV for a one-shot SFX

```typescript
const track = AudioTrack.fromPcm({
  buffer: pcm,
  sampleRate: 48000,
  channels: 1,
  format: "s16le",
});

const wavBuffer = track.toWav();
```

This is the primary `pcm_48000` path for short one-shot assets. Keep the track at 48 kHz end-to-end to avoid unnecessary conversion.

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

For inputs with more than 2 channels, `toStereo()` uses a simple downmix-to-mono-then-duplicate rule.

### Build a sequence with gaps

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

### Analyze loudness without transforming

```typescript
const track = await AudioTrack.fromBuffer({ buffer });

console.log(`Loudness: ${track.loudness()} LUFS`);
console.log(`True Peak: ${track.truePeak()} dBTP`);
console.log(`RMS: ${track.rms()} dB`);
console.log(`Duration: ${track.duration}s`);
```

---

## Error Handling

neiro throws standard `Error` instances with descriptive messages:

| Error                                                  | When                                                          |
| ------------------------------------------------------ | ------------------------------------------------------------- |
| `"Unsupported sample rate for K-weighting: {rate}Hz"`  | LUFS measurement with a sample rate other than 44100 or 48000 |
| `"Sample rate must be positive"`                       | `fromPcm()` with `sampleRate <= 0`                            |
| `"PCM buffer length must be divisible by frame size"`  | `fromPcm()` with non-frame-aligned PCM input                  |
| `"resample sampleRate must be a finite positive number"` | `resample()` with `0`, negative, `NaN`, or `Infinity`         |
| `"Cannot concat tracks with different sample rates"`   | `concat()` with mismatched sample rates                       |
| `"Cannot concat tracks with different channel counts"` | `concat()` with mismatched channel counts                     |
| `"Cannot mix tracks with different sample rates"`      | `mix()` with mismatched sample rates                          |
| `"Cannot mix tracks with different channel counts"`    | `mix()` with mismatched channel counts                        |
| `"Channel index out of range"`                         | `getChannel()` with an invalid index                          |
| `"Speed rate must be positive"`                        | `speed()` with zero or negative rate                          |

For `fromBuffer()`, decoding errors from the underlying codec are passed through. Raw PCM should go through `fromPcm()`, not `fromBuffer()`.

---

## Defaults Summary

| Parameter               | Default     | Standard                     |
| ----------------------- | ----------- | ---------------------------- |
| `normalize.target`      | `-14` LUFS  | EBU R128 foreground          |
| `normalize.peakLimit`   | `-1.5` dBTP | EBU R128 true peak           |
| `trimSilence.thresholdDb` | `-30` dB RMS | Windowed silence threshold |
| `trimSilence.headMs`      | `10` ms      | Natural attack preservation |
| `trimSilence.tailMs`      | `50` ms      | Natural decay preservation  |
| `fromPcm.channels`        | `1`          | Mono raw PCM input          |
| `fromPcm.format`          | `"s16le"`    | Signed 16-bit little-endian |
| `toMp3.bitrate`         | `128` kbps  | Good quality/size balance    |

# neiro — API Reference (v1)

Audio processing for TypeScript. Chainable, immutable, serverless-ready.

## Core Concept

Everything revolves around `AudioTrack` — an immutable object holding PCM audio data. You create one from a buffer, transform it with chainable methods, and export the result.

```typescript
import { AudioTrack } from "neiro";

const track = await AudioTrack.fromBuffer(mp3Buffer);

const result = track.normalize({ target: -14 }).trimSilence().fadeOut(10);

const output = result.toMp3({ bitrate: 128 });
```

Every transform returns a **new** `AudioTrack`. The original is never mutated.

---

## Construction

### `AudioTrack.fromBuffer(buffer)`

Decode a compressed audio buffer (MP3, WAV, OGG, FLAC) into an `AudioTrack`.

```typescript
const track = await AudioTrack.fromBuffer(buffer: Buffer): Promise<AudioTrack>
```

This is async because decoding compressed audio requires parsing frame headers, Huffman tables, etc. Format is auto-detected from the buffer contents.

### `AudioTrack.fromChannels(channels, options)`

Create an `AudioTrack` from raw PCM data. Use this when you already have decoded samples.

```typescript
const track = AudioTrack.fromChannels(
  channels: Float32Array[],  // [left] for mono, [left, right] for stereo
  options: { sampleRate: number }
): AudioTrack
```

Samples must be normalized to the `-1.0` to `1.0` range.

```typescript
// Mono track from raw samples
const mono = AudioTrack.fromChannels([samples], { sampleRate: 44100 });

// Stereo track
const stereo = AudioTrack.fromChannels([left, right], { sampleRate: 48000 });
```

### `AudioTrack.silence(durationMs, options?)`

Generate a silent track. Useful as a building block with `concat()` and `mix()`.

```typescript
const gap = AudioTrack.silence(
  durationMs: number,
  options?: { sampleRate?: number; channels?: number }
): AudioTrack
```

Defaults: `sampleRate: 44100`, `channels: 1`.

```typescript
// 500ms of silence
const gap = AudioTrack.silence(500);

// 1 second of stereo silence at 48kHz
const gap = AudioTrack.silence(1000, { sampleRate: 48000, channels: 2 });
```

---

## Properties

Read-only properties on every `AudioTrack` instance.

| Property     | Type     | Description                            |
| ------------ | -------- | -------------------------------------- |
| `duration`   | `number` | Duration in seconds                    |
| `sampleRate` | `number` | Sample rate in Hz (e.g., 44100, 48000) |
| `channels`   | `number` | Channel count (1 = mono, 2 = stereo)   |
| `length`     | `number` | Total samples per channel              |

```typescript
const track = await AudioTrack.fromBuffer(mp3Buffer);
track.duration; // 4.2
track.sampleRate; // 44100
track.channels; // 2
track.length; // 185220
```

---

## Measurement

Methods that analyze the audio without modifying it.

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

### `track.getChannel(index)`

Access raw PCM samples for a specific channel.

```typescript
track.getChannel(index: number): Float32Array
```

Returns a **copy** of the channel data (the track remains immutable).

- `0` = left (or mono)
- `1` = right

Throws if the index is out of range.

```typescript
const leftSamples = track.getChannel(0);
const rightSamples = track.getChannel(1);
```

---

## Transforms

Every transform returns a new `AudioTrack`. They can be chained.

### `track.gain(db)`

Apply gain (volume adjustment) in decibels.

```typescript
track.gain(db: number): AudioTrack
```

Positive values boost, negative values attenuate. No clipping protection — use `normalize()` if you need peak limiting.

```typescript
track.gain(6); // +6 dB (roughly doubles perceived loudness)
track.gain(-3); // -3 dB (roughly halves power)
```

### `track.normalize(options?)`

Normalize loudness to a target LUFS with true peak limiting.

```typescript
track.normalize(options?: {
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

### `track.trimSilence(options?)`

Remove leading and trailing silence.

```typescript
track.trimSilence(options?: {
  threshold?: number;  // Silence threshold in dB (default: -30)
  headMs?: number;     // Buffer to keep before content (default: 10)
  tailMs?: number;     // Buffer to keep after content (default: 50)
}): AudioTrack
```

Uses windowed RMS scanning (not sample-level detection) for robust silence detection that ignores brief transients.

- **Leading trim**: Scans forward with the configured threshold. Keeps `headMs` of buffer before the first loud window for a natural attack.
- **Trailing trim**: Scans backward with the configured threshold. Keeps `tailMs` of buffer after the last loud window for natural decay.

Returns the original track unchanged if no significant silence is found.

```typescript
// Sensible defaults
track.trimSilence();

// More aggressive leading trim
track.trimSilence({ threshold: -20, headMs: 5 });

// Keep more tail for reverb
track.trimSilence({ tailMs: 200 });
```

### `track.fadeIn(ms)`

Apply a linear fade-in from silence.

```typescript
track.fadeIn(ms: number): AudioTrack
```

Ramps gain from 0 to 1 over the specified duration. Use after `trimSilence()` to prevent clicks at the trim point.

```typescript
track.fadeIn(5); // 5ms fade-in (click prevention)
track.fadeIn(500); // 500ms fade-in (artistic)
```

### `track.fadeOut(ms)`

Apply a linear fade-out to silence.

```typescript
track.fadeOut(ms: number): AudioTrack
```

Ramps gain from 1 to 0 over the specified duration at the end of the track.

```typescript
track.fadeOut(10); // 10ms fade-out (click prevention)
track.fadeOut(2000); // 2 second fade-out (song ending)
```

### `track.slice(startMs, endMs?)`

Extract a segment of the track.

```typescript
track.slice(
  startMs: number,
  endMs?: number  // Defaults to end of track
): AudioTrack
```

Returns a new track containing only the audio between `startMs` and `endMs`.

```typescript
// First 2 seconds
track.slice(0, 2000);

// Everything after the first second
track.slice(1000);

// A 500ms segment starting at 3 seconds
track.slice(3000, 3500);
```

### `track.concat(other)`

Join two tracks end-to-end.

```typescript
track.concat(other: AudioTrack): AudioTrack
```

The tracks must have the same sample rate and channel count. Throws if they don't match.

```typescript
const intro = await AudioTrack.fromBuffer(introMp3);
const body = await AudioTrack.fromBuffer(bodyMp3);
const full = intro.concat(body);
```

### `track.mix(other, options?)`

Mix (overlay) another track on top of this one.

```typescript
track.mix(
  other: AudioTrack,
  options?: { gainDb?: number }  // Gain applied to `other` before mixing (default: 0)
): AudioTrack
```

Adds the samples together. The output length is the longer of the two tracks. The tracks must have the same sample rate and channel count.

```typescript
// Layer background ambience under dialogue
const dialogue = await AudioTrack.fromBuffer(dialogueMp3);
const ambience = await AudioTrack.fromBuffer(ambienceMp3);
const mixed = dialogue.mix(ambience, { gainDb: -6 });
```

### `track.reverse()`

Reverse the audio.

```typescript
track.reverse(): AudioTrack
```

```typescript
const reversed = track.reverse();
```

### `track.speed(rate)`

Change playback speed by resampling. Does not preserve pitch.

```typescript
track.speed(rate: number): AudioTrack
```

`rate > 1` = faster and higher pitched. `rate < 1` = slower and lower pitched. Uses linear interpolation for resampling.

The output sample rate stays the same — the duration changes.

```typescript
track.speed(2); // Double speed, half duration, octave up
track.speed(0.5); // Half speed, double duration, octave down
track.speed(1.5); // 1.5x speed
```

---

## Export

### `track.toMp3(options?)`

Encode the track to MP3.

```typescript
track.toMp3(options?: {
  bitrate?: number  // kbps (default: 128)
}): Buffer
```

```typescript
const mp3 = track.toMp3(); // 128 kbps
const hq = track.toMp3({ bitrate: 320 }); // 320 kbps
```

### `track.toWav()`

Encode the track to WAV (16-bit PCM).

```typescript
track.toWav(): Buffer
```

WAV is lossless and trivial to parse. Use this when you need an interchange format or when quality matters more than file size.

```typescript
const wav = track.toWav();
```

### `track.toPcm()`

Get the raw PCM data and metadata.

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
const sfx = await AudioTrack.fromBuffer(raw);

const processed = sfx
  .normalize({ target: -14, peakLimit: -1.5 })
  .trimSilence({ threshold: -30, headMs: 10, tailMs: 50 })
  .fadeIn(5)
  .fadeOut(10);

const output = processed.toMp3({ bitrate: 128 });
```

### Prepare background music

```typescript
const music = await AudioTrack.fromBuffer(raw);

const processed = music.normalize({ target: -20 }).fadeIn(500).fadeOut(2000);

const output = processed.toMp3({ bitrate: 192 });
```

### Build a sequence with gaps

```typescript
const beep = await AudioTrack.fromBuffer(beepMp3);
const gap = AudioTrack.silence(300, { sampleRate: beep.sampleRate });

const sequence = beep.concat(gap).concat(beep).concat(gap).concat(beep);

const output = sequence.toWav();
```

### Analyze loudness without transforming

```typescript
const track = await AudioTrack.fromBuffer(buffer);

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
| `"Cannot concat tracks with different sample rates"`   | `concat()` or `mix()` with mismatched sample rates            |
| `"Cannot concat tracks with different channel counts"` | `concat()` or `mix()` with mismatched channel counts          |
| `"Channel index out of range"`                         | `getChannel()` with an invalid index                          |
| `"Speed rate must be positive"`                        | `speed()` with zero or negative rate                          |

For `fromBuffer()`, decoding errors from the underlying codec are passed through.

---

## Defaults Summary

| Parameter               | Default     | Standard                     |
| ----------------------- | ----------- | ---------------------------- |
| `normalize.target`      | `-14` LUFS  | EBU R128 foreground          |
| `normalize.peakLimit`   | `-1.5` dBTP | EBU R128 true peak           |
| `trimSilence.threshold` | `-30` dB    | Matches ffmpeg silencedetect |
| `trimSilence.headMs`    | `10` ms     | Natural attack preservation  |
| `trimSilence.tailMs`    | `50` ms     | Natural decay preservation   |
| `toMp3.bitrate`         | `128` kbps  | Good quality/size balance    |

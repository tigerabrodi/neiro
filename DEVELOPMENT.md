# neiro — Development Guide

How to build this library from scratch using TDD with bun, TypeScript, Vite, and Vitest.

## Prerequisites

- [Bun](https://bun.sh) (v1.0+)
- A terminal

## Setup

```bash
git clone <repo-url>
cd neiro
bun install
```

## Commands

```bash
bun run test          # Run tests once
bun run test:watch    # Run tests in watch mode (TDD loop)
bun run test:coverage # Run tests with coverage report
bun run typecheck     # Type-check without emitting
bun run build         # Build library (ESM + CJS + .d.ts)
```

**Important**: Use `bun run test`, not `bun test`. The latter invokes Bun's own test runner instead of Vitest.

## Project Structure

```
neiro/
├── src/
│   ├── index.ts              # Public API — all exports go through here
│   ├── audio-track.ts        # AudioTrack class (the main API surface)
│   ├── dsp/
│   │   ├── biquad-filter.ts  # IIR biquad filter (Direct Form I)
│   │   ├── k-weighting.ts    # K-weighting filter coefficients (44.1k, 48k)
│   │   ├── lufs.ts           # Integrated loudness (ITU-R BS.1770-4)
│   │   ├── true-peak.ts      # True peak detection (4x oversampling, polyphase FIR)
│   │   └── utils.ts          # dB/linear conversion helpers
│   ├── codecs/
│   │   ├── mp3.ts            # MP3 encode (lamejs) + decode (audio-decode)
│   │   └── wav.ts            # WAV encode/decode (pure TypeScript)
│   └── transforms/
│       ├── normalize.ts      # LUFS normalization + true peak limiting
│       ├── trim-silence.ts   # Leading/trailing silence removal
│       ├── gain.ts           # Volume adjustment
│       ├── fade.ts           # Fade in/out
│       ├── slice.ts          # Segment extraction
│       ├── concat.ts         # End-to-end joining
│       ├── mix.ts            # Track overlay
│       ├── reverse.ts        # Reverse audio
│       └── speed.ts          # Playback speed (resampling)
├── tests/
│   ├── dsp/
│   │   ├── biquad-filter.test.ts
│   │   ├── k-weighting.test.ts
│   │   ├── lufs.test.ts
│   │   └── true-peak.test.ts
│   ├── codecs/
│   │   ├── mp3.test.ts
│   │   └── wav.test.ts
│   ├── transforms/
│   │   ├── normalize.test.ts
│   │   ├── trim-silence.test.ts
│   │   ├── gain.test.ts
│   │   ├── fade.test.ts
│   │   ├── slice.test.ts
│   │   ├── concat.test.ts
│   │   ├── mix.test.ts
│   │   ├── reverse.test.ts
│   │   └── speed.test.ts
│   ├── audio-track.test.ts   # Integration tests for the full API
│   └── fixtures/             # Test audio files
│       ├── sine-440hz.wav    # 1 second, 440Hz sine wave, mono, 44100Hz
│       ├── silence-1s.wav    # 1 second of silence
│       └── stereo-tone.wav   # Short stereo test tone
├── API.md
├── DEVELOPMENT.md
├── RELEASE.md
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## TDD Workflow

The entire library is built test-first. Start Vitest in watch mode and keep it running:

```bash
bun run test:watch
```

Every module is developed in this order: write a failing test, make it pass, refactor. The build order below is designed so each layer is testable before the next layer depends on it.

---

## Build Order (Chronological)

### Phase 1: DSP Primitives

The math layer. No dependencies on codecs or the AudioTrack class. Pure functions operating on `Float32Array`.

#### 1.1 — `src/dsp/utils.ts`

dB/linear conversion helpers. The simplest possible starting point.

```typescript
// What to implement:
dbToLinear(db: number): number
linearToDb(linear: number): number
```

**Tests to write:**

- `dbToLinear(0)` returns `1`
- `dbToLinear(-6)` returns approximately `0.501` (half amplitude)
- `dbToLinear(-Infinity)` returns `0`
- `linearToDb(1)` returns `0`
- `linearToDb(0)` returns `-Infinity`
- Round-trip: `dbToLinear(linearToDb(x))` returns `x`

#### 1.2 — `src/dsp/biquad-filter.ts`

Second-order IIR filter in Direct Form I. Used by K-weighting.

```typescript
// What to implement:
class BiquadFilter {
  constructor(coefficients: BiquadCoefficients);
  process(sample: number): number;
  processBuffer(input: Float32Array): Float32Array;
  reset(): void;
}
```

**Tests to write:**

- Unity filter (b0=1, all others 0) passes signal through unchanged
- Known coefficients produce expected output for a simple input sequence
- `reset()` clears state — processing same input twice gives same output
- `processBuffer()` matches sequential `process()` calls

#### 1.3 — `src/dsp/k-weighting.ts`

K-weighting filter (pre-filter high shelf + RLB high pass) per ITU-R BS.1770-4. Coefficients for 44100Hz and 48000Hz.

```typescript
// What to implement:
applyKWeighting(samples: Float32Array, sampleRate: number): Float32Array
getChannelWeight(channelIndex: number, totalChannels: number): number
```

**Tests to write:**

- DC signal (constant value) is attenuated (high-pass behavior)
- High-frequency signal passes through with gain (high-shelf behavior)
- Stereo channels get weight 1.0
- Throws on unsupported sample rate (e.g., 22050)

#### 1.4 — `src/dsp/lufs.ts`

Integrated loudness measurement. The core algorithm.

```typescript
// What to implement:
measureLufs(channels: Float32Array[], sampleRate: number): number
```

**Tests to write:**

- Silence returns `-Infinity`
- Audio shorter than 400ms returns `-Infinity`
- Full-scale sine wave (~-3 LUFS) — verify within 0.5 LU tolerance
- -20 dB sine wave measures approximately -23 LUFS (within tolerance)
- Mono and stereo produce consistent results for same content
- Known reference signal (EBU R128 test vectors if available)

#### 1.5 — `src/dsp/true-peak.ts`

True peak detection with 4x oversampling using polyphase FIR interpolation.

```typescript
// What to implement:
measureTruePeak(samples: Float32Array, sampleRate: number): number
measureTruePeakStereo(left: Float32Array, right: Float32Array | null, sampleRate: number): number
```

**Tests to write:**

- Single impulse: true peak >= sample peak (intersample peak detection)
- Full-scale square wave: true peak is `1.0`
- Silence: true peak is `0`
- Stereo returns max across both channels
- Two consecutive samples at 0.9 and -0.9: true peak should be > 0.9 (intersample overshoot)

---

### Phase 2: Codecs

Encoding and decoding. WAV is pure TypeScript, MP3 wraps the two external dependencies.

#### 2.1 — `src/codecs/wav.ts`

WAV encoder and decoder. This is pure TypeScript — the WAV format is just a 44-byte RIFF header followed by raw PCM samples.

```typescript
// What to implement:
encodeWav(channels: Float32Array[], sampleRate: number): Buffer
decodeWav(buffer: Buffer): { channels: Float32Array[]; sampleRate: number }
```

**Tests to write:**

- Encode then decode: round-trip produces same samples (within 16-bit quantization error)
- Mono encoding produces correct header (RIFF, fmt chunk, data chunk)
- Stereo encoding interleaves channels correctly
- Decoder rejects non-WAV buffers with clear error
- Output buffer size matches expected: `44 + numSamples * numChannels * 2`

#### 2.2 — `src/codecs/mp3.ts`

MP3 encode/decode wrapping lamejs and audio-decode.

```typescript
// What to implement:
encodeMp3(channels: Float32Array[], sampleRate: number, bitrate?: number): Buffer
decodeMp3(buffer: Buffer): Promise<{ channels: Float32Array[]; sampleRate: number }>
```

**Tests to write:**

- Encode then decode: round-trip preserves approximate waveform (MP3 is lossy — test RMS similarity, not exact samples)
- Encoded buffer starts with MP3 sync word or ID3 header
- Mono encoding works
- Stereo encoding works
- Default bitrate is 128

---

### Phase 3: Transforms

Each transform is a pure function: takes channel data + params, returns new channel data.

#### 3.1 — `src/transforms/gain.ts`

```typescript
applyGain(channels: Float32Array[], gainDb: number): Float32Array[]
```

**Tests:** 0dB = no change, +6dB doubles amplitude, -6dB halves.

#### 3.2 — `src/transforms/fade.ts`

```typescript
applyFadeIn(channels: Float32Array[], sampleRate: number, ms: number): Float32Array[]
applyFadeOut(channels: Float32Array[], sampleRate: number, ms: number): Float32Array[]
```

**Tests:** First sample is 0 after fade-in, last sample is 0 after fade-out, middle samples untouched.

#### 3.3 — `src/transforms/slice.ts`

```typescript
sliceChannels(channels: Float32Array[], sampleRate: number, startMs: number, endMs?: number): Float32Array[]
```

**Tests:** Correct length, correct content, handles edge cases (startMs=0, endMs=undefined).

#### 3.4 — `src/transforms/reverse.ts`

```typescript
reverseChannels(channels: Float32Array[]): Float32Array[]
```

**Tests:** Double reverse = original. First sample becomes last.

#### 3.5 — `src/transforms/concat.ts`

```typescript
concatChannels(a: Float32Array[], b: Float32Array[]): Float32Array[]
```

**Tests:** Output length is sum. Content is in order.

#### 3.6 — `src/transforms/mix.ts`

```typescript
mixChannels(a: Float32Array[], b: Float32Array[], gainDb?: number): Float32Array[]
```

**Tests:** Mixing with silence = original. Output length is max of both. Gain is applied to second track.

#### 3.7 — `src/transforms/speed.ts`

```typescript
changeSpeed(channels: Float32Array[], rate: number): Float32Array[]
```

**Tests:** `speed(2)` halves length. `speed(0.5)` doubles length. `speed(1)` = no change.

#### 3.8 — `src/transforms/normalize.ts`

The big one. Depends on LUFS measurement and true peak.

```typescript
normalizeLoudness(
  channels: Float32Array[],
  sampleRate: number,
  options?: { target?: number; peakLimit?: number }
): Float32Array[]
```

**Tests:**

- Output loudness is within 0.5 LU of target
- Output true peak is at or below peakLimit
- Silence input returns silence unchanged
- Stereo balance is preserved (both channels get same gain)

#### 3.9 — `src/transforms/trim-silence.ts`

```typescript
trimSilence(
  channels: Float32Array[],
  sampleRate: number,
  options?: { threshold?: number; headMs?: number; tailMs?: number }
): Float32Array[]
```

**Tests:**

- Leading silence is removed
- Trailing silence is removed
- Content in the middle is preserved
- Head/tail buffers are kept
- No-op if no significant silence

---

### Phase 4: AudioTrack Class

Wire everything together. The `AudioTrack` class is a thin wrapper that delegates to the functions built in phases 1-3.

#### 4.1 — `src/audio-track.ts`

```typescript
class AudioTrack {
  // Construction
  static fromBuffer(buffer: Buffer): Promise<AudioTrack>;
  static fromChannels(
    channels: Float32Array[],
    options: { sampleRate: number },
  ): AudioTrack;
  static silence(
    durationMs: number,
    options?: { sampleRate?: number; channels?: number },
  ): AudioTrack;

  // Properties
  get duration(): number;
  get sampleRate(): number;
  get channels(): number;
  get length(): number;

  // Measurement
  loudness(): number;
  truePeak(): number;
  rms(): number;
  getChannel(index: number): Float32Array;

  // Transforms
  gain(db: number): AudioTrack;
  normalize(options?: { target?: number; peakLimit?: number }): AudioTrack;
  trimSilence(options?: {
    threshold?: number;
    headMs?: number;
    tailMs?: number;
  }): AudioTrack;
  fadeIn(ms: number): AudioTrack;
  fadeOut(ms: number): AudioTrack;
  slice(startMs: number, endMs?: number): AudioTrack;
  concat(other: AudioTrack): AudioTrack;
  mix(other: AudioTrack, options?: { gainDb?: number }): AudioTrack;
  reverse(): AudioTrack;
  speed(rate: number): AudioTrack;

  // Export
  toMp3(options?: { bitrate?: number }): Buffer;
  toWav(): Buffer;
  toPcm(): { channels: Float32Array[]; sampleRate: number };
}
```

**Tests to write (integration):**

- Full chain: `fromBuffer → normalize → trimSilence → fadeOut → toMp3` produces valid MP3
- `fromChannels → toWav → fromBuffer` round-trips correctly
- `silence(1000).duration` is approximately 1.0
- Immutability: original track is unchanged after transforms
- Method chaining works: `track.gain(6).fadeIn(5).fadeOut(10)`
- Error cases: mismatched concat, invalid channel index

#### 4.2 — `src/index.ts`

Public API exports. Only export what users need.

```typescript
export { AudioTrack } from "./audio-track";
```

---

### Phase 5: Integration & Polish

#### 5.1 — End-to-end tests

Test realistic workflows with actual MP3 files:

- Normalize a quiet MP3, verify output loudness
- Trim a padded MP3, verify shorter duration
- Chain multiple operations, verify output

#### 5.2 — Build verification

```bash
bun run build
```

Verify the dist output:

- `dist/index.js` (ESM)
- `dist/index.cjs` (CJS)
- `dist/index.d.ts` (types)

#### 5.3 — Coverage check

```bash
bun run test:coverage
```

Target: >90% line coverage on `src/`.

---

## Test Fixtures

Generate test fixtures programmatically rather than checking in audio files. Create a helper:

```typescript
// tests/fixtures/generate.ts
function generateSineWave(
  frequency: number,
  durationMs: number,
  sampleRate: number = 44100,
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

function generateSilence(
  durationMs: number,
  sampleRate: number = 44100,
): Float32Array {
  return new Float32Array(Math.floor((durationMs / 1000) * sampleRate));
}

// Silence + content + silence (for trim testing)
function generatePaddedTone(
  leadingSilenceMs: number,
  toneMs: number,
  trailingSilenceMs: number,
): Float32Array {
  const silence1 = generateSilence(leadingSilenceMs);
  const tone = generateSineWave(440, toneMs);
  const silence2 = generateSilence(trailingSilenceMs);
  const total = new Float32Array(
    silence1.length + tone.length + silence2.length,
  );
  total.set(silence1, 0);
  total.set(tone, silence1.length);
  total.set(silence2, silence1.length + tone.length);
  return total;
}
```

This way tests are self-contained and don't depend on binary files in the repo.

---

## Debugging Tips

- **LUFS measurement seems off?** Check that K-weighting coefficients are correct for the sample rate. The 44100Hz and 48000Hz coefficients are different.
- **True peak too high?** The polyphase FIR filter computes intersample peaks. Two samples at +0.9 and -0.9 can have an intersample peak of +1.2 or higher.
- **MP3 round-trip quality?** MP3 is lossy. Don't compare samples directly — compare RMS, loudness, or use a correlation metric.
- **WAV encoding wrong?** Check byte order (little-endian), interleaving order (L R L R for stereo), and the header field values.

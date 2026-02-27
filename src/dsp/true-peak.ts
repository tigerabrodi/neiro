/**
 * True peak measurement per ITU-R BS.1770-4.
 *
 * Uses 4x oversampling with a polyphase FIR interpolation filter
 * (48-tap windowed-sinc, split into 4 phases of 12 taps each)
 * to detect intersample peaks that exceed the sample peak value.
 *
 * Returns linear values — convert to dBTP via linearToDb() externally.
 *
 * Pure TypeScript — no WASM, no native dependencies.
 */

const OVERSAMPLING_FACTOR = 4;
const FIR_TAPS_PER_PHASE = 12;
const TOTAL_TAPS = OVERSAMPLING_FACTOR * FIR_TAPS_PER_PHASE; // 48

/**
 * Generate polyphase FIR filter coefficients for 4x oversampling.
 *
 * The prototype filter is a windowed-sinc low-pass at cutoff = 1/(2*L)
 * where L is the oversampling factor. We use a Kaiser window (beta=5)
 * for good stopband attenuation.
 *
 * The sinc center is placed at the nearest multiple of L to the filter
 * midpoint (24 for 48 taps). This ensures phase 0 taps land on integer
 * sinc arguments, giving h[kL] = delta[k-D] — perfect reconstruction
 * of original sample values.
 *
 * The 48 coefficients are split into 4 phases of 12 taps:
 *   phase p, tap k → prototype index (k * L + p)
 *
 * Phase 0 reproduces the original sample positions.
 * Phases 1–3 are the 3 intermediate interpolated points.
 */
function generatePolyphaseCoefficients(): Float64Array[] {
  const prototype = new Float64Array(TOTAL_TAPS);

  // Sinc center at nearest multiple of L to the midpoint.
  // For N=48: midpoint=23.5, nearest multiple of 4 = 24.
  // Phase 0 tap D=6 lands on sinc(0)=1, all others on sinc(integer)=0.
  const sincCenter =
    Math.round((TOTAL_TAPS - 1) / 2 / OVERSAMPLING_FACTOR) *
    OVERSAMPLING_FACTOR; // 24

  // Window center at the true midpoint for symmetry
  const windowCenter = (TOTAL_TAPS - 1) / 2; // 23.5

  const beta = 5.0;
  const i0Beta = besselI0(beta);

  for (let n = 0; n < TOTAL_TAPS; n++) {
    // Sinc function centered at sincCenter
    const x = (n - sincCenter) / OVERSAMPLING_FACTOR;
    let sinc: number;
    if (Math.abs(x) < 1e-10) {
      sinc = 1.0;
    } else {
      sinc = Math.sin(Math.PI * x) / (Math.PI * x);
    }

    // Kaiser window centered at windowCenter
    const windowArg = (n - windowCenter) / windowCenter;
    const sqVal = 1 - windowArg * windowArg;
    const window = sqVal <= 0 ? 0 : besselI0(beta * Math.sqrt(sqVal)) / i0Beta;

    prototype[n] = sinc * window;
  }

  // Split into polyphase components
  const phases: Float64Array[] = [];
  for (let p = 0; p < OVERSAMPLING_FACTOR; p++) {
    const phase = new Float64Array(FIR_TAPS_PER_PHASE);
    for (let k = 0; k < FIR_TAPS_PER_PHASE; k++) {
      phase[k] = prototype[k * OVERSAMPLING_FACTOR + p]!;
    }
    phases.push(phase);
  }

  // Normalize each phase for unity DC gain.
  // Ensures a constant input reproduces exactly and phase 0
  // perfectly reconstructs original sample values.
  for (const phase of phases) {
    let sum = 0;
    for (let k = 0; k < FIR_TAPS_PER_PHASE; k++) {
      sum += phase[k]!;
    }
    for (let k = 0; k < FIR_TAPS_PER_PHASE; k++) {
      phase[k]! /= sum;
    }
  }

  return phases;
}

/**
 * Modified Bessel function of the first kind, order 0.
 * Used for the Kaiser window computation.
 */
function besselI0(x: number): number {
  let sum = 1.0;
  let term = 1.0;
  const halfX = x / 2;

  for (let k = 1; k <= 20; k++) {
    term *= (halfX / k) * (halfX / k);
    sum += term;
    if (term < 1e-12 * sum) break;
  }

  return sum;
}

// Pre-compute coefficients at module load (sample-rate independent)
const PHASES = generatePolyphaseCoefficients();

/**
 * Measure the true peak (linear) of a single channel using 4x oversampling.
 *
 * @param samples - Audio samples as Float32Array
 * @param sampleRate - Sample rate in Hz (unused — coefficients are rate-independent,
 *                     but kept for API consistency)
 * @returns Maximum absolute interpolated sample value (linear)
 */
export function measureTruePeak(
  samples: Float32Array,
  _sampleRate: number,
): number {
  const length = samples.length;
  if (length === 0) return 0;

  let maxPeak = 0;

  for (let n = 0; n < length; n++) {
    // Track raw sample peak (covers boundary regions where interpolation
    // is skipped to avoid artifacts from zero-padded taps)
    const rawAbs = Math.abs(samples[n]!);
    if (rawAbs > maxPeak) maxPeak = rawAbs;

    // Apply polyphase interpolation only where all taps are in bounds.
    // At boundaries, some taps would read zero-padded values, causing
    // Gibbs-like overshoot artifacts that aren't real intersample peaks.
    if (n < FIR_TAPS_PER_PHASE - 1) continue;

    for (let p = 0; p < OVERSAMPLING_FACTOR; p++) {
      const phase = PHASES[p]!;
      let sum = 0;

      for (let k = 0; k < FIR_TAPS_PER_PHASE; k++) {
        sum += phase[k]! * samples[n - k]!;
      }

      const absValue = Math.abs(sum);
      if (absValue > maxPeak) {
        maxPeak = absValue;
      }
    }
  }

  return maxPeak;
}

/**
 * Measure the true peak (linear) across stereo channels.
 *
 * @param left - Left channel samples
 * @param right - Right channel samples
 * @param sampleRate - Sample rate in Hz
 * @returns Maximum absolute true peak across both channels (linear)
 */
export function measureTruePeakStereo(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
): number {
  const leftPeak = measureTruePeak(left, sampleRate);
  const rightPeak = measureTruePeak(right, sampleRate);
  return Math.max(leftPeak, rightPeak);
}

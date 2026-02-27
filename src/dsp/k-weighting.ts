/**
 * K-weighting filter for ITU-R BS.1770 / EBU R128 loudness measurement.
 *
 * K-weighting consists of two cascaded biquad filters:
 * 1. Pre-filter (high-shelf) - accounts for acoustic effects of the head
 * 2. RLB (Revised Low-frequency B-curve) high-pass filter
 *
 * Coefficients are computed from the analog prototypes specified in ITU-R BS.1770-4.
 * Full precision to ensure measurement accuracy within 0.1 LU.
 *
 * Pure TypeScript - no WASM, no native dependencies.
 */

import { BiquadFilter, type BiquadCoefficients } from "./biquad-filter";

/**
 * Pre-computed coefficients for supported sample rates.
 *
 * These are derived from the analog filter specifications in ITU-R BS.1770-4:
 * - Pre-filter: High-shelf with +4dB gain above ~1.5kHz
 * - RLB filter: High-pass with -3dB at ~60Hz
 *
 * Computing these at runtime for arbitrary sample rates requires bilinear transform
 * with frequency pre-warping. For now, we support the two most common rates.
 */

// 48000 Hz coefficients (reference rate from ITU-R BS.1770-4)
const PREFILTER_48000: BiquadCoefficients = {
  b0: 1.53512485958697,
  b1: -2.69169618940638,
  b2: 1.19839281085285,
  a0: 1.0,
  a1: -1.69065929318241,
  a2: 0.73248077421585,
};

const RLB_48000: BiquadCoefficients = {
  b0: 1.0,
  b1: -2.0,
  b2: 1.0,
  a0: 1.0,
  a1: -1.99004745483398,
  a2: 0.99007225036621,
};

// 44100 Hz coefficients (computed via bilinear transform with pre-warping)
const PREFILTER_44100: BiquadCoefficients = {
  b0: 1.5308412300498355,
  b1: -2.6509799951536985,
  b2: 1.1690790799210682,
  a0: 1.0,
  a1: -1.6636551132560204,
  a2: 0.7125954280732254,
};

const RLB_44100: BiquadCoefficients = {
  b0: 1.0,
  b1: -2.0,
  b2: 1.0,
  a0: 1.0,
  a1: -1.9891696736297957,
  a2: 0.9891990357870394,
};

export interface KWeightingFilters {
  preFilter: BiquadFilter;
  rlbFilter: BiquadFilter;
}

/**
 * Create K-weighting filters for a given sample rate.
 *
 * @param sampleRate - Sample rate in Hz (must be 44100 or 48000)
 * @throws Error if sample rate is not supported
 */
export function createKWeightingFilters(
  sampleRate: number
): KWeightingFilters {
  let preCoeffs: BiquadCoefficients;
  let rlbCoeffs: BiquadCoefficients;

  if (sampleRate === 48000) {
    preCoeffs = PREFILTER_48000;
    rlbCoeffs = RLB_48000;
  } else if (sampleRate === 44100) {
    preCoeffs = PREFILTER_44100;
    rlbCoeffs = RLB_44100;
  } else {
    throw new Error(
      `Unsupported sample rate for K-weighting: ${sampleRate}Hz. ` +
        `Supported rates: 44100Hz, 48000Hz. Consider resampling audio before LUFS measurement.`
    );
  }

  return {
    preFilter: new BiquadFilter(preCoeffs),
    rlbFilter: new BiquadFilter(rlbCoeffs),
  };
}

/**
 * Apply K-weighting to an audio buffer.
 *
 * K-weighting is a frequency weighting that approximates the relative loudness
 * perceived by humans. It's the first stage of EBU R128 / ITU-R BS.1770 measurement.
 *
 * @param samples - Audio samples (Float32Array, normalized -1 to 1)
 * @param sampleRate - Sample rate in Hz
 * @returns K-weighted audio samples
 */
export function applyKWeighting(
  samples: Float32Array,
  sampleRate: number
): Float32Array {
  const filters = createKWeightingFilters(sampleRate);

  // Apply pre-filter (high-shelf)
  const afterPre = filters.preFilter.processBuffer(samples);

  // Apply RLB filter (high-pass)
  const afterRlb = filters.rlbFilter.processBuffer(afterPre);

  return afterRlb;
}

/**
 * Get the channel weight for LUFS calculation.
 *
 * Per ITU-R BS.1770-4:
 * - Front channels (L, R, C): weight = 1.0
 * - Surround channels (Ls, Rs): weight = 1.41 (~+1.5dB)
 * - LFE: excluded from measurement
 *
 * For stereo content (most common case), both channels have weight 1.0.
 *
 * @param channelIndex - 0-based channel index
 * @param totalChannels - Total number of channels
 * @returns Channel weight (1.0 for front, 1.41 for surround)
 */
export function getChannelWeight(
  channelIndex: number,
  totalChannels: number
): number {
  // For mono/stereo, all channels have weight 1.0
  if (totalChannels <= 2) {
    return 1.0;
  }

  // For 5.1 surround (6 channels):
  // 0=L, 1=R, 2=C, 3=LFE, 4=Ls, 5=Rs
  if (totalChannels === 6) {
    // LFE (channel 3) is excluded
    if (channelIndex === 3) {
      return 0.0;
    }
    // Surround channels (4, 5) get +1.5dB boost
    if (channelIndex === 4 || channelIndex === 5) {
      return 1.41253754462275; // 10^(1.5/10)
    }
    // Front channels
    return 1.0;
  }

  // Default: weight 1.0
  return 1.0;
}

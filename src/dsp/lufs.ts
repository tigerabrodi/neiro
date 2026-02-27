/**
 * Integrated loudness measurement per ITU-R BS.1770-4 / EBU R128.
 *
 * Algorithm:
 * 1. K-weight each channel
 * 2. Divide into 400ms overlapping blocks (75% overlap = 100ms hop)
 * 3. Compute per-block loudness (weighted mean square across channels)
 * 4. Apply absolute gate at -70 LUFS
 * 5. Compute relative threshold (mean of ungated blocks - 10 LU)
 * 6. Apply relative gate
 * 7. Compute final integrated loudness from surviving blocks
 *
 * Pure TypeScript - no WASM, no native dependencies.
 */

import { applyKWeighting, getChannelWeight } from "./k-weighting";

const ABSOLUTE_GATE_LUFS = -70;
const RELATIVE_GATE_LU = -10;
const BLOCK_DURATION_SEC = 0.4;
const OVERLAP_RATIO = 0.75;

function meanSquareToLufs(meanSquare: number): number {
  if (meanSquare <= 0) return -Infinity;
  return -0.691 + 10 * Math.log10(meanSquare);
}

function lufsToMeanSquare(lufs: number): number {
  return Math.pow(10, (lufs + 0.691) / 10);
}

/**
 * Compute per-block weighted mean square values using 400ms sliding window
 * with 75% overlap (100ms hop).
 *
 * Returns an array of weighted mean square values (one per block).
 */
function calculateBlockMeanSquares(
  channels: Float32Array[],
  sampleRate: number
): number[] {
  const blockSize = Math.floor(BLOCK_DURATION_SEC * sampleRate);
  const hopSize = Math.floor(blockSize * (1 - OVERLAP_RATIO));
  const numChannels = channels.length;
  const numSamples = channels[0]!.length;

  if (numSamples < blockSize) {
    return [];
  }

  const weights: number[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    weights.push(getChannelWeight(ch, numChannels));
  }

  const blocks: number[] = [];
  for (let start = 0; start + blockSize <= numSamples; start += hopSize) {
    let weightedSum = 0;

    for (let ch = 0; ch < numChannels; ch++) {
      const weight = weights[ch]!;
      if (weight === 0) continue;

      const channel = channels[ch]!;
      let channelSum = 0;
      for (let i = start; i < start + blockSize; i++) {
        const sample = channel[i]!;
        channelSum += sample * sample;
      }
      weightedSum += weight * (channelSum / blockSize);
    }

    blocks.push(weightedSum);
  }

  return blocks;
}

/**
 * Apply dual gating (absolute at -70 LUFS, relative at -10 LU) to block
 * mean square values.
 *
 * Returns the final integrated mean square value, or 0 if no blocks survive.
 */
function applyGating(blockMeanSquares: number[]): number {
  if (blockMeanSquares.length === 0) return 0;

  // Stage 1: Absolute gate at -70 LUFS
  const absoluteThreshold = lufsToMeanSquare(ABSOLUTE_GATE_LUFS);
  const afterAbsolute = blockMeanSquares.filter(
    (ms) => ms > absoluteThreshold
  );

  if (afterAbsolute.length === 0) return 0;

  // Compute mean of blocks above absolute gate
  let absoluteSum = 0;
  for (const ms of afterAbsolute) {
    absoluteSum += ms;
  }
  const absoluteMean = absoluteSum / afterAbsolute.length;

  // Stage 2: Relative gate at -10 LU below mean
  const relativeLufs = meanSquareToLufs(absoluteMean) + RELATIVE_GATE_LU;
  const relativeThreshold = lufsToMeanSquare(relativeLufs);

  const afterRelative = afterAbsolute.filter(
    (ms) => ms > relativeThreshold
  );

  if (afterRelative.length === 0) return 0;

  // Compute final mean from surviving blocks
  let relativeSum = 0;
  for (const ms of afterRelative) {
    relativeSum += ms;
  }
  return relativeSum / afterRelative.length;
}

/**
 * Calculate integrated loudness (LUFS) per ITU-R BS.1770-4.
 *
 * @param channels - Array of Float32Array, one per channel (mono = 1, stereo = 2)
 * @param sampleRate - Sample rate in Hz (44100 or 48000)
 * @returns Integrated loudness in LUFS, or -Infinity for silence/short audio
 */
export function calculateIntegratedLoudness(
  channels: Float32Array[],
  sampleRate: number
): number {
  if (channels.length === 0) return -Infinity;

  // K-weight each channel
  const kWeighted: Float32Array[] = [];
  for (const channel of channels) {
    kWeighted.push(applyKWeighting(channel, sampleRate));
  }

  // Calculate per-block mean square values
  const blockMeanSquares = calculateBlockMeanSquares(kWeighted, sampleRate);

  if (blockMeanSquares.length === 0) return -Infinity;

  // Apply dual gating
  const integratedMeanSquare = applyGating(blockMeanSquares);

  if (integratedMeanSquare === 0) return -Infinity;

  return meanSquareToLufs(integratedMeanSquare);
}

/**
 * Convenience wrapper for mono/stereo LUFS measurement.
 *
 * @param leftChannel - Left (or mono) channel samples
 * @param rightChannel - Right channel samples, or null for mono
 * @param sampleRate - Sample rate in Hz
 * @returns Integrated loudness in LUFS
 */
export function measureLUFS(
  leftChannel: Float32Array,
  rightChannel: Float32Array | null,
  sampleRate: number
): number {
  const channels: Float32Array[] = [leftChannel];
  if (rightChannel !== null) {
    channels.push(rightChannel);
  }
  return calculateIntegratedLoudness(channels, sampleRate);
}

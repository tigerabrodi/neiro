import { calculateIntegratedLoudness } from "../dsp/lufs";
import { measureTruePeak } from "../dsp/true-peak";
import { dbToLinear } from "../dsp/utils";

export function normalizeLoudness(
  channels: Float32Array[],
  sampleRate: number,
  options?: { target?: number; peakLimit?: number },
): Float32Array[] {
  const target = options?.target ?? -14;
  const peakLimitDb = options?.peakLimit ?? -1;

  const currentLoudness = calculateIntegratedLoudness(channels, sampleRate);

  // Silence or too-short audio — return as-is
  if (currentLoudness === -Infinity) {
    return channels.map((ch) => new Float32Array(ch));
  }

  // Calculate gain needed to reach target loudness
  let gainDb = target - currentLoudness;
  let gainLinear = dbToLinear(gainDb);

  // Check if gain would push true peak above limit
  const peakLimitLinear = dbToLinear(peakLimitDb);
  let maxPeak = 0;
  for (const ch of channels) {
    const peak = measureTruePeak(ch, sampleRate);
    if (peak > maxPeak) maxPeak = peak;
  }

  const peakAfterGain = maxPeak * gainLinear;
  if (peakAfterGain > peakLimitLinear) {
    gainLinear = peakLimitLinear / maxPeak;
  }

  return channels.map((ch) => {
    const out = new Float32Array(ch.length);
    for (let i = 0; i < ch.length; i++) {
      out[i] = ch[i]! * gainLinear;
    }
    return out;
  });
}

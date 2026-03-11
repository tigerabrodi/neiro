import { dbToLinear } from "../dsp/utils";

const ANALYSIS_WINDOW_SECONDS = 0.01;

type TrimSilenceOptions = {
  thresholdDb?: number;
  headMs?: number;
  tailMs?: number;
};

function getWindowLevel(
  channels: Float32Array[],
  start: number,
  end: number,
): number {
  let loudestChannelRms = 0;
  const sampleCount = end - start;

  for (const ch of channels) {
    let sumSquares = 0;
    for (let i = start; i < end; i++) {
      const sample = ch[i]!;
      sumSquares += sample * sample;
    }

    const rms = Math.sqrt(sumSquares / sampleCount);
    if (rms > loudestChannelRms) {
      loudestChannelRms = rms;
    }
  }

  return loudestChannelRms;
}

export function trimSilence(
  channels: Float32Array[],
  sampleRate: number,
  options?: TrimSilenceOptions,
): Float32Array[] {
  const thresholdDb = options?.thresholdDb ?? -30;
  const headMs = options?.headMs ?? 10;
  const tailMs = options?.tailMs ?? 50;

  if (headMs < 0) {
    throw new Error("trimSilence headMs must be >= 0");
  }
  if (tailMs < 0) {
    throw new Error("trimSilence tailMs must be >= 0");
  }
  if (thresholdDb > 0) {
    throw new Error("trimSilence thresholdDb must be <= 0");
  }

  const headSamples = Math.floor((headMs / 1000) * sampleRate);
  const tailSamples = Math.floor((tailMs / 1000) * sampleRate);
  const numSamples = channels[0]!.length;
  const windowSize = Math.max(1, Math.floor(sampleRate * ANALYSIS_WINDOW_SECONDS));
  const thresholdLinear = dbToLinear(thresholdDb);
  const numWindows = Math.ceil(numSamples / windowSize);

  let firstContentWindow = -1;
  for (let windowIndex = 0; windowIndex < numWindows; windowIndex++) {
    const start = windowIndex * windowSize;
    const end = Math.min(numSamples, start + windowSize);
    if (getWindowLevel(channels, start, end) > thresholdLinear) {
      firstContentWindow = windowIndex;
      break;
    }
  }

  if (firstContentWindow === -1) {
    return channels.map((ch) => ch.slice());
  }

  let lastContentWindow = firstContentWindow;
  for (let windowIndex = numWindows - 1; windowIndex >= firstContentWindow; windowIndex--) {
    const start = windowIndex * windowSize;
    const end = Math.min(numSamples, start + windowSize);
    if (getWindowLevel(channels, start, end) > thresholdLinear) {
      lastContentWindow = windowIndex;
      break;
    }
  }

  const contentStart = firstContentWindow * windowSize;
  const contentEnd = Math.min(numSamples, (lastContentWindow + 1) * windowSize);
  const trimStart = Math.max(0, contentStart - headSamples);
  const trimEnd = Math.min(numSamples, contentEnd + tailSamples);

  return channels.map((ch) => ch.slice(trimStart, trimEnd));
}

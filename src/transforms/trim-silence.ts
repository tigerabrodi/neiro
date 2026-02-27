export function trimSilence(
  channels: Float32Array[],
  sampleRate: number,
  options?: { threshold?: number; headMs?: number; tailMs?: number },
): Float32Array[] {
  const threshold = options?.threshold ?? 0.01;
  const headMs = options?.headMs ?? 0;
  const tailMs = options?.tailMs ?? 0;
  const headSamples = Math.floor((headMs / 1000) * sampleRate);
  const tailSamples = Math.floor((tailMs / 1000) * sampleRate);
  const numSamples = channels[0]!.length;

  // Find first non-silent sample across all channels
  let start = 0;
  for (let i = 0; i < numSamples; i++) {
    let aboveThreshold = false;
    for (const ch of channels) {
      if (Math.abs(ch[i]!) > threshold) {
        aboveThreshold = true;
        break;
      }
    }
    if (aboveThreshold) {
      start = i;
      break;
    }
  }

  // Find last non-silent sample across all channels
  let end = numSamples - 1;
  for (let i = numSamples - 1; i >= 0; i--) {
    let aboveThreshold = false;
    for (const ch of channels) {
      if (Math.abs(ch[i]!) > threshold) {
        aboveThreshold = true;
        break;
      }
    }
    if (aboveThreshold) {
      end = i;
      break;
    }
  }

  // Apply head/tail buffers
  const trimStart = Math.max(0, start - headSamples);
  const trimEnd = Math.min(numSamples - 1, end + tailSamples);

  return channels.map((ch) => ch.slice(trimStart, trimEnd + 1));
}

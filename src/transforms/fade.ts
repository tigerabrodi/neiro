export function applyFadeIn(
  channels: Float32Array[],
  sampleRate: number,
  ms: number,
): Float32Array[] {
  const fadeSamples = Math.floor((ms / 1000) * sampleRate);
  return channels.map((ch) => {
    const out = new Float32Array(ch.length);
    for (let i = 0; i < ch.length; i++) {
      const gain = i < fadeSamples ? i / fadeSamples : 1;
      out[i] = ch[i]! * gain;
    }
    return out;
  });
}

export function applyFadeOut(
  channels: Float32Array[],
  sampleRate: number,
  ms: number,
): Float32Array[] {
  const fadeSamples = Math.floor((ms / 1000) * sampleRate);
  return channels.map((ch) => {
    const out = new Float32Array(ch.length);
    const fadeStart = ch.length - fadeSamples;
    for (let i = 0; i < ch.length; i++) {
      const gain = i >= fadeStart ? (ch.length - 1 - i) / fadeSamples : 1;
      out[i] = ch[i]! * gain;
    }
    return out;
  });
}

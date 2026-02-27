export function changeSpeed(
  channels: Float32Array[],
  rate: number,
): Float32Array[] {
  return channels.map((ch) => {
    const newLength = Math.round(ch.length / rate);
    const out = new Float32Array(newLength);
    for (let i = 0; i < newLength; i++) {
      const srcIndex = i * rate;
      const idx0 = Math.floor(srcIndex);
      const idx1 = Math.min(idx0 + 1, ch.length - 1);
      const frac = srcIndex - idx0;
      out[i] = ch[idx0]! * (1 - frac) + ch[idx1]! * frac;
    }
    return out;
  });
}

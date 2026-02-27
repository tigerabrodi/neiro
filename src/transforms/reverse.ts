export function reverseChannels(channels: Float32Array[]): Float32Array[] {
  return channels.map((ch) => {
    const out = new Float32Array(ch.length);
    for (let i = 0; i < ch.length; i++) {
      out[i] = ch[ch.length - 1 - i]!;
    }
    return out;
  });
}

export function concatChannels(
  a: Float32Array[],
  b: Float32Array[],
): Float32Array[] {
  return a.map((aCh, i) => {
    const bCh = b[i]!;
    const out = new Float32Array(aCh.length + bCh.length);
    out.set(aCh, 0);
    out.set(bCh, aCh.length);
    return out;
  });
}

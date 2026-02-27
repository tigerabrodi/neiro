import { dbToLinear } from "../dsp/utils";

export function mixChannels(
  a: Float32Array[],
  b: Float32Array[],
  gainDb: number = 0,
): Float32Array[] {
  const gain = dbToLinear(gainDb);
  return a.map((aCh, i) => {
    const bCh = b[i]!;
    const length = Math.max(aCh.length, bCh.length);
    const out = new Float32Array(length);
    for (let j = 0; j < length; j++) {
      const aVal = j < aCh.length ? aCh[j]! : 0;
      const bVal = j < bCh.length ? bCh[j]! * gain : 0;
      out[j] = aVal + bVal;
    }
    return out;
  });
}

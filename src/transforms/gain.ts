import { dbToLinear } from "../dsp/utils";

export function applyGain(
  channels: Float32Array[],
  gainDb: number,
): Float32Array[] {
  const multiplier = dbToLinear(gainDb);
  return channels.map((ch) => {
    const out = new Float32Array(ch.length);
    for (let i = 0; i < ch.length; i++) {
      out[i] = ch[i]! * multiplier;
    }
    return out;
  });
}

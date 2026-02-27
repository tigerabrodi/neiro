export function sliceChannels(
  channels: Float32Array[],
  sampleRate: number,
  startMs: number,
  endMs?: number,
): Float32Array[] {
  const startSample = Math.floor((startMs / 1000) * sampleRate);
  const endSample =
    endMs !== undefined
      ? Math.floor((endMs / 1000) * sampleRate)
      : channels[0]!.length;

  return channels.map((ch) => ch.slice(startSample, endSample));
}

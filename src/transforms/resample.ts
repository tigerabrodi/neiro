const INVALID_SAMPLE_RATE_ERROR =
  "resample sampleRate must be a finite positive number";

function assertValidSampleRate(sampleRate: number): void {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new Error(INVALID_SAMPLE_RATE_ERROR);
  }
}

function resampleChannel(
  channel: Float32Array,
  sourceSampleRate: number,
  targetSampleRate: number,
): Float32Array {
  const sourceLength = channel.length;
  if (sourceLength === 0) {
    return new Float32Array(0);
  }

  const targetLength = Math.max(
    1,
    Math.round((sourceLength * targetSampleRate) / sourceSampleRate),
  );

  if (targetLength === sourceLength && sourceSampleRate === targetSampleRate) {
    return Float32Array.from(channel);
  }

  if (sourceLength === 1) {
    const output = new Float32Array(targetLength);
    output.fill(channel[0]!);
    return output;
  }

  if (targetLength === 1) {
    return new Float32Array([channel[0]!]);
  }

  const output = new Float32Array(targetLength);

  for (let i = 0; i < targetLength; i++) {
    const sourcePosition = (i * (sourceLength - 1)) / (targetLength - 1);
    const leftIndex = Math.floor(sourcePosition);
    const rightIndex = Math.min(leftIndex + 1, sourceLength - 1);
    const fraction = sourcePosition - leftIndex;
    const leftSample = channel[leftIndex]!;
    const rightSample = channel[rightIndex]!;

    output[i] = leftSample * (1 - fraction) + rightSample * fraction;
  }

  return output;
}

export function resampleChannels(
  channels: Float32Array[],
  {
    sourceSampleRate,
    targetSampleRate,
  }: {
    sourceSampleRate: number;
    targetSampleRate: number;
  },
): Float32Array[] {
  assertValidSampleRate(targetSampleRate);

  return channels.map((channel) =>
    resampleChannel(channel, sourceSampleRate, targetSampleRate),
  );
}

export function downmixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 0) {
    return new Float32Array(0);
  }

  if (channels.length === 1) {
    return Float32Array.from(channels[0]!);
  }

  const length = channels[0]!.length;
  const output = new Float32Array(length);

  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (const channel of channels) {
      sum += channel[i]!;
    }
    output[i] = sum / channels.length;
  }

  return output;
}

export function upmixMonoToStereo(
  channel: Float32Array,
): [Float32Array, Float32Array] {
  return [Float32Array.from(channel), Float32Array.from(channel)];
}

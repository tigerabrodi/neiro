export function decodePcm({
  buffer,
  sampleRate,
  channels = 1,
  format = "s16le",
}: {
  buffer: Buffer;
  sampleRate: number;
  channels?: number;
  format?: "s16le";
}): {
  channels: Float32Array[];
  sampleRate: number;
} {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new Error("Sample rate must be positive");
  }

  if (format !== "s16le") {
    throw new Error(`Unsupported PCM format: ${format}`);
  }

  if (channels !== 1 && channels !== 2) {
    throw new Error("PCM channel count must be 1 or 2");
  }

  const bytesPerSample = 2;
  const frameSize = channels * bytesPerSample;
  if (buffer.byteLength % frameSize !== 0) {
    throw new Error("PCM buffer length must be divisible by frame size");
  }

  const numFrames = buffer.byteLength / frameSize;
  const decodedChannels: Float32Array[] = [];
  for (let ch = 0; ch < channels; ch++) {
    decodedChannels.push(new Float32Array(numFrames));
  }

  const view = new DataView(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength,
  );

  let offset = 0;
  for (let frame = 0; frame < numFrames; frame++) {
    for (let ch = 0; ch < channels; ch++) {
      decodedChannels[ch]![frame] = view.getInt16(offset, true) / 32768;
      offset += bytesPerSample;
    }
  }

  return {
    channels: decodedChannels,
    sampleRate,
  };
}

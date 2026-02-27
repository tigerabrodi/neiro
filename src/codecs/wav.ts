const HEADER_SIZE = 44;

export function encodeWav(
  channels: Float32Array[],
  sampleRate: number,
): Buffer {
  const numChannels = channels.length;
  const numSamples = channels[0]!.length;
  const dataSize = numSamples * numChannels * 2;
  const fileSize = HEADER_SIZE + dataSize;

  const buffer = Buffer.alloc(fileSize);
  const view = new DataView(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength,
  );

  // RIFF header
  buffer.write("RIFF", 0);
  view.setUint32(4, fileSize - 8, true);
  buffer.write("WAVE", 8);

  // fmt chunk
  buffer.write("fmt ", 12);
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true); // byte rate
  view.setUint16(32, numChannels * 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample

  // data chunk
  buffer.write("data", 36);
  view.setUint32(40, dataSize, true);

  // Interleaved 16-bit PCM
  let offset = HEADER_SIZE;
  for (let i = 0; i < numSamples; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const clamped = Math.max(-1, Math.min(1, channels[ch]![i]!));
      const int16 = clamped < 0 ? clamped * 32768 : clamped * 32767;
      view.setInt16(offset, int16, true);
      offset += 2;
    }
  }

  return buffer;
}

export function decodeWav(buffer: Buffer): {
  channels: Float32Array[];
  sampleRate: number;
} {
  if (buffer.byteLength < HEADER_SIZE) {
    throw new Error("Invalid WAV file: too short");
  }

  const view = new DataView(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength,
  );

  const riff = buffer.toString("ascii", 0, 4);
  const wave = buffer.toString("ascii", 8, 12);
  if (riff !== "RIFF" || wave !== "WAVE") {
    throw new Error("Invalid WAV file: missing RIFF/WAVE header");
  }

  const numChannels = view.getUint16(22, true);
  const sampleRate = view.getUint32(24, true);
  const bitsPerSample = view.getUint16(34, true);
  const dataSize = view.getUint32(40, true);
  const bytesPerSample = bitsPerSample / 8;
  const numSamples = dataSize / (numChannels * bytesPerSample);

  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(new Float32Array(numSamples));
  }

  let offset = HEADER_SIZE;
  for (let i = 0; i < numSamples; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const int16 = view.getInt16(offset, true);
      channels[ch]![i] = int16 / 32768;
      offset += 2;
    }
  }

  return { channels, sampleRate };
}

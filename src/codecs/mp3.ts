import { Mp3Encoder } from "@breezystack/lamejs";
import audioDecode from "audio-decode";

export function encodeMp3(
  channels: Float32Array[],
  sampleRate: number,
  bitrate: number = 128,
): Buffer {
  const numChannels = channels.length;
  const numSamples = channels[0]!.length;

  const encoder = new Mp3Encoder(numChannels, sampleRate, bitrate);
  const chunks: Uint8Array[] = [];

  // Convert Float32 → Int16
  const int16Channels: Int16Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    const int16 = new Int16Array(numSamples);
    const floats = channels[ch]!;
    for (let i = 0; i < numSamples; i++) {
      const clamped = Math.max(-1, Math.min(1, floats[i]!));
      int16[i] = clamped < 0 ? clamped * 32768 : clamped * 32767;
    }
    int16Channels.push(int16);
  }

  // Encode in chunks of 1152 samples (MP3 frame size)
  const CHUNK_SIZE = 1152;
  for (let i = 0; i < numSamples; i += CHUNK_SIZE) {
    const end = Math.min(i + CHUNK_SIZE, numSamples);
    const leftChunk = int16Channels[0]!.subarray(i, end);

    let encoded: Uint8Array;
    if (numChannels === 1) {
      encoded = encoder.encodeBuffer(leftChunk);
    } else {
      const rightChunk = int16Channels[1]!.subarray(i, end);
      encoded = encoder.encodeBuffer(leftChunk, rightChunk);
    }

    if (encoded.length > 0) {
      chunks.push(encoded);
    }
  }

  const flushed = encoder.flush();
  if (flushed.length > 0) {
    chunks.push(flushed);
  }

  // Concatenate all chunks into a single Buffer
  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
  const result = Buffer.alloc(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

export async function decodeMp3(
  buffer: Buffer,
): Promise<{ channels: Float32Array[]; sampleRate: number }> {
  const audioBuffer = await audioDecode(buffer);

  const channels: Float32Array[] = [];
  for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
    channels.push(audioBuffer.getChannelData(ch));
  }

  return { channels, sampleRate: audioBuffer.sampleRate };
}

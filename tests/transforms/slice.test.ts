import { describe, expect, it } from "vitest";
import { sliceChannels } from "../../src/transforms/slice";

describe("sliceChannels", () => {
  const sampleRate = 1000; // 1 sample per ms

  it("extracts correct length", () => {
    const input = [new Float32Array(500)];
    const output = sliceChannels(input, sampleRate, 100, 300);
    expect(output[0]!.length).toBe(200);
  });

  it("extracts correct content", () => {
    const samples = new Float32Array(500);
    for (let i = 0; i < 500; i++) samples[i] = i;
    const output = sliceChannels([samples], sampleRate, 100, 300);
    expect(output[0]![0]).toBe(100);
    expect(output[0]![199]).toBe(299);
  });

  it("startMs=0 starts from beginning", () => {
    const samples = new Float32Array(500);
    for (let i = 0; i < 500; i++) samples[i] = i;
    const output = sliceChannels([samples], sampleRate, 0, 100);
    expect(output[0]![0]).toBe(0);
    expect(output[0]!.length).toBe(100);
  });

  it("endMs=undefined slices to end", () => {
    const samples = new Float32Array(500);
    for (let i = 0; i < 500; i++) samples[i] = i;
    const output = sliceChannels([samples], sampleRate, 400);
    expect(output[0]!.length).toBe(100);
    expect(output[0]![0]).toBe(400);
  });
});

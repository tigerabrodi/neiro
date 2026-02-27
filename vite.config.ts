/// <reference types="vitest/config" />
import { resolve } from "path";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "neiro",
      formats: ["es", "cjs"],
      fileName: "index",
    },
    rollupOptions: {
      // Don't bundle these — users install them alongside neiro
      external: ["@breezystack/lamejs", "audio-decode"],
    },
    target: "es2022",
    sourcemap: true,
    minify: false, // Library — let consumers minify
  },
  plugins: [
    dts({
      rollupTypes: true, // Bundle .d.ts into a single file
    }),
  ],
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts"], // Re-exports only
    },
  },
});

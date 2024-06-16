import { defineConfig } from "tsup";

export default defineConfig([
  {
    name: "react",
    entry: ["src/index.tsx"],
    format: ["esm", "iife"],
    target: ["esnext"],
    platform: "browser",
    outDir: "dist",
    clean: true,
    sourcemap: true,
    metafile: true,
    minify: false,
    dts: {
      footer: "declare module 'use-fireproof'",
    },
  },
]);

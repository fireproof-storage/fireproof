import { defineConfig } from "tsup";

export default defineConfig([
  {
    name: "react-native",
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
      footer: "declare module '@fireproof/react-native'",
    },
  },
]);

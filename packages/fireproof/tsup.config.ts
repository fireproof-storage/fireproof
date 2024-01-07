import { defineConfig } from 'tsup';

export default defineConfig([
  {
    name: "@fireproof/core",
    entryPoints: ['src/fireproof.ts'],
    outDir: 'dist',
    format: ['esm', 'cjs', 'iife'],
    target: ["esnext", "node18"],
    clean: true,
    sourcemap: true,
    minify: true,
    dts: {
      footer: "declare module '@fireproof/core'"
    },
  }
]);

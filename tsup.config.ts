import { defineConfig, Options } from 'tsup';
import resolve from "esbuild-plugin-resolve"
import path from "path"

const LIBRARY_BUNDLE_OPTIONS: Options = {
  format: ["esm", "cjs", "iife"],
  target: ["esnext", "node18"],
  globalName: "Fireproof",
  external: ["node:fs", "node:path", "node:os", "node:url", "assert"],
  clean: true,
  sourcemap: true,
  metafile: true,
  minify: false,
}

const LIBRARY_BUNDLES: readonly Options[] = [
  {
    ...LIBRARY_BUNDLE_OPTIONS,
    name: "core/browser",
    entry: ["src/index.ts"],
    platform: "browser",
    outDir: "dist/pubdir",
    esbuildPlugins: [
      resolve({
        // "./node-sys-container.js": path.join(__dirname, './src/runtime/memory-sys-container.js'),
        // "node:fs": path.join(__dirname, './src/runtime/memory-sys-container.js'),
        // "node:path": path.join(__dirname, './src/runtime/memory-sys-container.js'),
        // "node:os": path.join(__dirname, './src/runtime/memory-sys-container.js'),
        // "node:url": path.join(__dirname, './src/runtime/memory-sys-container.js'),
        // "assert": path.join(__dirname, './src/runtime/memory-sys-container.js'),
      })
    ],
    dts: {
      footer: "declare module '@fireproof/core'"
    },
  },
/*
  {
    ...LIBRARY_BUNDLE_OPTIONS,
    name: "core/node",
    entry: ["src/index.ts"],
    platform: "node",
    outDir: "dist/pubdir/node",
    dts: {
      footer: "declare module '@fireproof/core'"
    },
  },
  {
    ...LIBRARY_BUNDLE_OPTIONS,
    name: "core/memory",
    entry: ["src/index.ts"],
    platform: "browser",
    outDir: "dist/pubdir/memory",
    esbuildPlugins: [
      resolve({
        // "./node-sys-container": path.join(__dirname, './src/runtime/memory-sys-container.js'),
        // "node:fs": path.join(__dirname, './src/runtime/memory-sys-container.js'),
        // "node:path": path.join(__dirname, './src/runtime/memory-sys-container.js'),
        // "node:os": path.join(__dirname, './src/runtime/memory-sys-container.js'),
        // "node:url": path.join(__dirname, './src/runtime/memory-sys-container.js'),
        // "assert": path.join(__dirname, './src/runtime/memory-sys-container.js'),
      })
    ],
    dts: {
      footer: "declare module '@fireproof/core'"
    },
  },
*/
]

export default defineConfig((options) => [
  ...LIBRARY_BUNDLES,
  ...(options.watch || [])
]);

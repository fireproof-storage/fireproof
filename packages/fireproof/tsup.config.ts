import { defineConfig, Options } from 'tsup';
import resolve from "esbuild-plugin-resolve"
import path from "path"

const LIBRARY_BUNDLE_OPTIONS: Options = {
  format: ["esm", "cjs", "iife"],
  target: ["esnext", "node18"],
  globalName: "Fireproof",
  clean: true,
  sourcemap: true,
  metafile: true,
  minify: false,
}

const LIBRARY_BUNDLES: readonly Options[] = [
  {
    ...LIBRARY_BUNDLE_OPTIONS,
    name: "core/browser",
    entry: ["src/fireproof.ts"],
    platform: "browser",
    outDir: "dist/browser",
    dts: {
      footer: "declare module '@fireproof/core'"
    },
  },
  {
    ...LIBRARY_BUNDLE_OPTIONS,
    name: "core/node",
    entry: ["src/fireproof.ts"],
    platform: "node",
    outDir: "dist/node",
    esbuildPlugins: [
      resolve({
        "./eb-web": path.join(__dirname, './src/eb-node.ts'),
      })
    ],
    dts: {
      footer: "declare module '@fireproof/core'"
    },
  },
  {
    ...LIBRARY_BUNDLE_OPTIONS,
    name: "core/memory",
    entry: ["src/fireproof.ts"],
    platform: "browser",
    outDir: "dist/memory",
    dts: {
      footer: "declare module '@fireproof/core'"
    },
  },
]

const TEST_BUNDLE_OPTIONS: Options = {
  outDir: "dist/test",
  format: ["esm"],
  target: ["esnext"],
  platform: "node",
  clean: true,
  sourcemap: true,
  minify: false,
}

const TEST_BUNDLES: readonly Options[] = [
  {
    ...TEST_BUNDLE_OPTIONS,
    name: "test/apply-head-queue",
    entry: ['src/apply-head-queue.ts'],
    dts: {
      footer: "declare module '@fireproof/core/apply-head-queue'"
    },
  },
  {
    ...TEST_BUNDLE_OPTIONS,
    name: "test/crdt-clock",
    entry: ['src/crdt-clock.ts'],
    dts: {
      footer: "declare module '@fireproof/core/crdt-clock'"
    },
  },
  {
    ...TEST_BUNDLE_OPTIONS,
    name: "test/crdt-helpers",
    entry: ['src/crdt-helpers.ts'],
    dts: {
      footer: "declare module '@fireproof/core/crdt-helpers'"
    },
  },
  {
    ...TEST_BUNDLE_OPTIONS,
    name: "test/crdt",
    entry: ['src/crdt.ts'],
    esbuildPlugins: [
      resolve({
        "./eb-web": path.join(__dirname, './src/eb-node.ts'),
      })
    ],
    dts: {
      footer: "declare module '@fireproof/core/crdt'"
    },
  },
  {
    ...TEST_BUNDLE_OPTIONS,
    name: "test/database",
    entry: ['src/database.ts'],
    esbuildPlugins: [
      resolve({
        "./eb-web": path.join(__dirname, './src/eb-node.ts'),
      })
    ],
    dts: {
      footer: "declare module '@fireproof/core/database'"
    },
  },
  {
    ...TEST_BUNDLE_OPTIONS,
    name: "test/index",
    entry: ['src/index.ts'],
    esbuildPlugins: [
      resolve({
        "./eb-web": path.join(__dirname, './src/eb-node.ts'),
      })
    ],
    dts: {
      footer: "declare module '@fireproof/core/index'"
    },
  },
]

export default defineConfig([ ...LIBRARY_BUNDLES, ...TEST_BUNDLES ]);

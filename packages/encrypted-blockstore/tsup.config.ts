import { defineConfig, Options } from 'tsup';
import { polyfillNode } from "esbuild-plugin-polyfill-node";

const CORE_OPTIONS: Options = {
  outDir: "dist/lib",
  format: ["esm", "cjs", "iife"],
  target: ["esnext", "node18"],
  globalName: "Fireproof",
  sourcemap: true,
  metafile: true,
  minify: false,
}

const NODE_PLUGINS = [
  polyfillNode({
    polyfills: { 
      crypto: true,
      fs: true, 
      process: "empty" 
    },
  })
]

const LIBRARY_BUNDLES: readonly Options[] = [
  {
    ...CORE_OPTIONS,
    name: "encrypted-blockstore",
    entry: ["src/index.ts"],
    platform: "browser",
    dts: {
      footer: "declare module '@fireproof/encrypted-blockstore'"
    },
  },
  {
    ...CORE_OPTIONS,
    name: "crypto-node",
    entry: ['src/crypto-node.ts'],
    platform: "node",
    plugins: NODE_PLUGINS,
    dts: {
      footer: "declare module '@fireproof/encrypted-blockstore/crypto-node'"
    },
  },
  {
    ...CORE_OPTIONS,
    name: "crypto-web",
    entry: ['src/crypto-web.ts'],
    platform: "browser",
    dts: {
      footer: "declare module '@fireproof/encrypted-blockstore/crypto-web'"
    },
  },
  {
    ...CORE_OPTIONS,
    name: "store-memory",
    entry: ['src/store-memory.ts'],
    platform: "browser",
    dts: {
      footer: "declare module '@fireproof/encrypted-blockstore/store-memory'"
    },
  },
  {
    ...CORE_OPTIONS,
    name: "store-node",
    entry: ['src/store-node.ts'],
    platform: "node",
    plugins: NODE_PLUGINS,
    dts: {
      footer: "declare module '@fireproof/encrypted-blockstore/store-node'"
    },
  },
  {
    ...CORE_OPTIONS,
    name: "store-web",
    entry: ['src/store-web.ts'],
    platform: "browser",
    plugins: NODE_PLUGINS,
    dts: {
      footer: "declare module '@fireproof/encrypted-blockstore/store-web'"
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
    name: "test/transaction",
    entry: ['src/transaction.ts'],
    dts: {
      footer: "declare module '@fireproof/encrypted-blockstore/transaction'"
    },
  },
  {
    ...TEST_BUNDLE_OPTIONS,
    name: "test/loader",
    entry: ['src/loader.ts'],
    dts: {
      footer: "declare module '@fireproof/encrypted-blockstore/loader'"
    },
  },
  {
    ...TEST_BUNDLE_OPTIONS,
    name: "test/loader-helpers",
    entry: ['src/loader-helpers.ts'],
    dts: {
      footer: "declare module '@fireproof/encrypted-blockstore/loader-helpers'"
    },
  },
]

export default defineConfig([ ...LIBRARY_BUNDLES, ...TEST_BUNDLES ]);

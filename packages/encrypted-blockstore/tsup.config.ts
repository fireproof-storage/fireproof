import { defineConfig, Options } from 'tsup';
import { polyfillNode } from "esbuild-plugin-polyfill-node";

const CORE_OPTIONS: Options = {
  outDir: "dist",
  format: ['esm', 'cjs', 'iife'],
  target: ["esnext", "node18"],
  sourcemap: true,
  metafile: true,
  minify: true,
}

const WEB_PLUGINS = [
  polyfillNode({
    polyfills: { 
      crypto: true, 
      fs: true, 
      process: 'empty' 
    },
  })
]

export default defineConfig([
  {
    ...CORE_OPTIONS,
    name: "encrypted-blockstore",
    entryPoints: ['src/index.ts'],
    plugins: WEB_PLUGINS,
    dts: {
      footer: "declare module '@fireproof/encrypted-blockstore'"
    },
  },
  {
    ...CORE_OPTIONS,
    name: "crypto-node",
    entryPoints: ['src/crypto-node.ts'],
    dts: {
      footer: "declare module '@fireproof/encrypted-blockstore/crypto-node'"
    },
  },
  {
    ...CORE_OPTIONS,
    name: "crypto-web",
    entryPoints: ['src/crypto-web.ts'],
    plugins: WEB_PLUGINS,
    dts: {
      footer: "declare module '@fireproof/encrypted-blockstore/crypto-web'"
    },
  },
  {
    ...CORE_OPTIONS,
    name: "store-node",
    entryPoints: ['src/store-node.ts'],
    dts: {
      footer: "declare module '@fireproof/encrypted-blockstore/store-node'"
    },
  },
  {
    ...CORE_OPTIONS,
    name: "store-web",
    entryPoints: ['src/store-web.ts'],
    plugins: WEB_PLUGINS,
    dts: {
      footer: "declare module '@fireproof/encrypted-blockstore/store-web'"
    },
  }
]);

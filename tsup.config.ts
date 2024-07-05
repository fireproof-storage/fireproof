import fs from "fs";
import { defineConfig, Options } from "tsup";
import resolve from "esbuild-plugin-resolve";
import { replace } from "esbuild-plugin-replace";

const external = [
  "path",
  "react",
  "fs",
  "util",
  "node:fs",
  "node:path",
  "node:os",
  "node:url",
  "assert",
  "stream",
  "better-sqlite3",
];

const LIBRARY_BUNDLE_OPTIONS: Options = {
  format: ["esm", "cjs", "iife"],
  target: ["esnext", "node18"],
  globalName: "Fireproof",
  external,
  clean: true,
  sourcemap: true,
  metafile: true,
  minify: false,
};

function packageVersion(file: string) {
  return JSON.stringify(JSON.parse(fs.readFileSync(file, "utf-8")).version);
}

const LIBRARY_BUNDLES: readonly Options[] = [
  {
    ...LIBRARY_BUNDLE_OPTIONS,
    format: ["esm", "cjs"],
    name: "@fireproof/core",
    entry: ["src/index.ts"],
    platform: "browser",
    outDir: "dist/fireproof-core",
    esbuildPlugins: [
      replace({
        __packageVersion__: packageVersion("package.json"),
        include: /version/,
      }),
      resolve({
        // "../runtime/store-sql/store-sql.js": "../runtime/store-sql/not-impl.js",
        // "../runtime/store-file.js": "../runtime/store-file-not-impl.js",
        // "./node-sys-container.js":  "../runtime/store-file-not-impl.js",
        // "node:fs": path.join(__dirname, './src/runtime/memory-sys-container.js'),
        // "node:path": path.join(__dirname, './src/runtime/memory-sys-container.js'),
        // "node:os": path.join(__dirname, './src/runtime/memory-sys-container.js'),
        // "node:url": path.join(__dirname, './src/runtime/memory-sys-container.js'),
        // "assert": path.join(__dirname, './src/runtime/memory-sys-container.js'),
      }),
    ],
    dts: {
      footer: "declare module '@fireproof/core'",
    },
  },
  {
    ...LIBRARY_BUNDLE_OPTIONS,
    name: "use-fireproof",
    entry: ["src/react/index.ts"],
    platform: "browser",
    outDir: "dist/use-fireproof",
    esbuildPlugins: [
      replace({
        __packageVersion__: packageVersion("package.json"),
        include: /version/,
      }),
      resolve({
        "../runtime/store-sql/store-sql.js": "../runtime/store-sql/not-impl.js",
        "../runtime/store-file.js": "../runtime/store-file-not-impl.js",
        // "./node-sys-container.js": path.join(__dirname, './src/runtime/memory-sys-container.js'),
        // "node:fs": path.join(__dirname, './src/runtime/memory-sys-container.js'),
        // "node:path": path.join(__dirname, './src/runtime/memory-sys-container.js'),
        // "node:os": path.join(__dirname, './src/runtime/memory-sys-container.js'),
        // "node:url": path.join(__dirname, './src/runtime/memory-sys-container.js'),
        // "assert": path.join(__dirname, './src/runtime/memory-sys-container.js'),
      }),
    ],
    dts: {
      footer: "declare module 'use-fireproof'",
    },
  },
];

export default defineConfig((options) => [...LIBRARY_BUNDLES, ...(options.watch || [])]);

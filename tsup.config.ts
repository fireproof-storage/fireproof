import { defineConfig, Options } from "tsup";
import resolve from "esbuild-plugin-resolve";
import { replace } from "esbuild-plugin-replace";

const external = [
  "path",
  "react",
  "fs",
  "fs/promises",
  "util",
  "os",
  "url",
  "node:fs",
  "node:path",
  "node:os",
  "node:url",
  "assert",
  "stream",
  "better-sqlite3",
];

const stopFile = {
  "../runtime/store-file.js": "../../bundle-not-impl.js",
  "../runtime/gateways/file/gateway.js": "../bundle-not-impl.js",
  "./mem-filesystem.js": "../../../bundle-not-impl.js",
  "./gateways/file/gateway.js": "../bundle-not-impl.js",
  "./node-sys-container.js": "../bundle-not-impl.js",
  "./key-bag-file.js": "../bundle-not-impl.js",
};

const ourMultiformat = {
  // "multiformats/block": `${__dirname}/src/runtime/multiformat/block.ts`
};

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

function packageVersion() {
  // return JSON.stringify(JSON.parse(fs.readFileSync(file, "utf-8")).version);
  let version = "refs/tags/v0.0.0-smoke";
  if (process.env.GITHUB_REF && process.env.GITHUB_REF.startsWith("refs/tags/v")) {
    version = process.env.GITHUB_REF;
  }
  version = version.split("/").slice(-1)[0].replace(/^v/, "");
  // console.log(`Patch version ${version} in package.json`);
  // packageJson.version = version;
  return JSON.stringify(version);
}

const LIBRARY_BUNDLES: readonly Options[] = [
  {
    ...LIBRARY_BUNDLE_OPTIONS,
    format: ["iife"],
    name: "@fireproof/core",
    entry: ["src/index.ts"],
    platform: "browser",
    outDir: "dist/fireproof-core",
    esbuildPlugins: [
      replace({
        __packageVersion__: packageVersion(),
        include: /version/,
      }),
      resolve({
        ...stopFile,
        ...ourMultiformat,
      }),
    ],
    dts: {
      footer: "declare module '@fireproof/core'",
    },
  },
  {
    ...LIBRARY_BUNDLE_OPTIONS,
    format: ["esm", "cjs"],
    name: "@fireproof/core",
    entry: ["src/index.ts"],
    platform: "browser",
    outDir: "dist/fireproof-core",
    esbuildPlugins: [
      replace({
        __packageVersion__: packageVersion(),
        include: /version/,
      }),
      resolve({
        ...ourMultiformat,
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
    target: ["esnext"],
    platform: "browser",
    outDir: "dist/use-fireproof",
    esbuildPlugins: [
      replace({
        __packageVersion__: packageVersion(),
        include: /version/,
      }),
      resolve({
        ...stopFile,
        ...ourMultiformat,
      }),
    ],
    dts: {
      footer: "declare module 'use-fireproof'",
    },
  },
];

export default defineConfig((options) => [...LIBRARY_BUNDLES, ...(options.watch || [])]);

import { defineConfig, Options } from "tsup";
import resolve from "esbuild-plugin-resolve";
import { replace } from "esbuild-plugin-replace";

const nodeInternals = ["./node/node-filesystem.js", "./node/mem-filesystem.js"];
// const webInternals = ["./web/gateway-impl.js"];
const webInternals = [];

const external = [
  "path",
  "react",
  "fs",
  "fs/promises",
  "node:fs",
  "node:fs/promises",
  "util",
  "os",
  "url",
  "node:path",
  "node:os",
  "node:url",
  "assert",
  "stream",
  "@fireproof/core",
  "@fireproof/core/node",
  "@fireproof/core/mem",
  "@fireproof/core/web",
  "@fireproof/core/react",
];

function skipper(suffix: string[], target: string) {
  function intercept(build) {
    const filter = new RegExp(`(${suffix.join("|")})`);
    build.onResolve({ filter }, async (args) => {
      if (target.startsWith("/")) {
        return build.resolve(target, { kind: args.kind, resolveDir: `/Users/menabe/Software/fproof/fireproof` });
      } else {
        return build.resolve(target, { kind: args.kind, resolveDir: args.resolveDir });
      }
      // const external = Boolean(build.initialOptions.external?.includes(args.path));
      // if (external) {
      // return { path: args.path, external };
      // }
      // if (args.resolveDir === '') {
      // return;
      // }
    });
  }
  return {
    name: "skipper",
    setup: (build) => {
      // for (const moduleName of Object.keys(options)) {
      intercept(build);
      // }
    },
  };
}

// const skipIife = {
//   // "node-filesystem@skip-iife": "../../../bundle-not-impl.js",
//   // "mem-filesystem@skip-iife": "../../../bundle-not-impl.js",
//   // "node:fs/promises": "../../../bundle-not-impl.js",
//   // "fs/promises": "../../../bundle-not-impl.js",
//   // "../runtime/store-file.js": "../../bundle-not-impl.js",
//   // "../runtime/gateways/file/gateway.js": "../bundle-not-impl.js",
//   // "./mem-filesystem.js": "../../../bundle-not-impl.js",
//   // "./gateways/file/gateway.js": "../bundle-not-impl.js",
//   // "./node-sys-container.js": "../bundle-not-impl.js",
//   // "./key-bag-file.js": "../bundle-not-impl.js",
// };
const skipEsm = {};

const ourMultiformat = {};

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
  // {
  //   ...LIBRARY_BUNDLE_OPTIONS,
  //   external: [...(LIBRARY_BUNDLE_OPTIONS.external || []), ...nodeInternals, ...webInternals],
  //   format: ["iife"],
  //   name: "@fireproof/core",
  //   entry: ["src/index.ts"],
  //   platform: "browser",
  //   outDir: "dist/fireproof-core",
  //   minify: true,
  //   esbuildPlugins: [
  //     replace({
  //       __packageVersion__: packageVersion(),
  //       include: /version/,
  //     }),
  //     skipper([...nodeInternals], `${__dirname}/src/bundle-not-impl.js`),
  //     skipper(["./get-file-system-static.js"], "./get-file-system-dynamic.js"),
  //     // skipper(["./gateway-import-static.js"], "././gateway-import-dynamic.js"),
  //     resolve({
  //       ...skipIife,
  //       ...ourMultiformat,
  //     }),
  //   ],
  //   dts: {
  //     footer: "declare module '@fireproof/core'",
  //   },
  // },
  {
    ...LIBRARY_BUNDLE_OPTIONS,
    format: ["esm", "cjs"],
    name: "@fireproof/core",
    entry: ["src/index.ts"],
    platform: "browser",
    outDir: "dist/fireproof-core",
    external: [...(LIBRARY_BUNDLE_OPTIONS.external || []), ...nodeInternals, ...webInternals],
    esbuildPlugins: [
      replace({
        __packageVersion__: packageVersion(),
        include: /version/,
      }),
      skipper([...nodeInternals, ...webInternals], `${__dirname}/src/bundle-not-impl.js`),
      // skipper(["./get-file-system-static.js"], "./get-file-system-dynamic.js"),
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
    format: ["esm", "cjs"],
    name: "@fireproof/core/node",
    entry: ["src/runtime/gateways/file/node/index.ts"],
    platform: "browser",
    outDir: "dist/fireproof-core/node",
    esbuildPlugins: [
      replace({
        __packageVersion__: packageVersion(),
        include: /version/,
      }),
      // skipper('@skip-iife', `${__dirname}/src/bundle-not-impl.js`),
      resolve({
        ...ourMultiformat,
      }),
    ],
    dts: {
      footer: "declare module '@fireproof/core/node'",
    },
  },
  {
    ...LIBRARY_BUNDLE_OPTIONS,
    format: ["esm"],
    name: "@fireproof/core/deno",
    entry: ["src/runtime/gateways/file/deno/index.ts"],
    platform: "browser",
    outDir: "dist/fireproof-core/deno",
    esbuildPlugins: [
      replace({
        __packageVersion__: packageVersion(),
        include: /version/,
      }),
      // skipper('@skip-iife', `${__dirname}/src/bundle-not-impl.js`),
      resolve({
        ...ourMultiformat,
      }),
    ],
    dts: {
      footer: "declare module '@fireproof/core/deno'",
    },
  },
  {
    ...LIBRARY_BUNDLE_OPTIONS,
    format: ["esm", "cjs"],
    name: "@fireproof/core/web",
    entry: ["src/runtime/gateways/indexdb/web/index.ts"],
    platform: "browser",
    outDir: "dist/fireproof-core/web",
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
      footer: "declare module '@fireproof/core/web'",
    },
  },
  {
    ...LIBRARY_BUNDLE_OPTIONS,
    external: [...(LIBRARY_BUNDLE_OPTIONS.external || []), "@fireproof/core"],
    format: ["esm", "cjs"],
    name: "@fireproof/core/react",
    entry: ["src/react/index.ts"],
    platform: "browser",
    outDir: "dist/fireproof-core/react",
    esbuildPlugins: [
      replace({
        __packageVersion__: packageVersion(),
        include: /version/,
      }),
      // skipper('@skip-iife', `${__dirname}/src/bundle-not-impl.js`),
      resolve({
        ...ourMultiformat,
      }),
    ],
    dts: {
      footer: "declare module '@fireproof/core/web'",
    },
  },
  {
    ...LIBRARY_BUNDLE_OPTIONS,
    external: [...(LIBRARY_BUNDLE_OPTIONS.external || []), "@fireproof/core", "@fireproof/core/react"],
    treeshake: true,
    format: ["esm", "cjs"],
    //    minify: true,
    name: "use-fireproof",
    entry: ["src/use-fireproof/index.ts"],
    target: ["esnext"],
    platform: "browser",
    outDir: "dist/use-fireproof",
    esbuildPlugins: [
      replace({
        __packageVersion__: packageVersion(),
        include: /version/,
      }),
      skipper([...nodeInternals], `${__dirname}/src/bundle-not-impl.js`),
      // skipper('@skip-iife', `${__dirname}/src/bundle-not-impl.js`),
      resolve({
        ...skipEsm,
        ...ourMultiformat,
      }),
    ],
    dts: {
      footer: "declare module 'use-fireproof'",
    },
  },
];

export default defineConfig(() => [...LIBRARY_BUNDLES]);

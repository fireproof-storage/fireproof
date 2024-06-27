 
 
import esbuildPluginTsc from "esbuild-plugin-tsc";
import alias from "esbuild-plugin-alias";
import fs from "fs";
import path, { dirname, join } from "path";
// import { polyfillNode } from 'esbuild-plugin-polyfill-node'
import { commonjs } from "@hyrious/esbuild-plugin-commonjs";

import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Obtain all .ts files in the src directory
const entryPoints = fs
  .readdirSync("src")
  .filter((file) => path.extname(file) === ".ts")
  .map((file) => path.join("src", file));

const doMinify = false;
const doLog = false;

export function createBuildSettings(options) {
  const commonSettings = {
    entryPoints,
    bundle: true,
    minify: doMinify,
    sourcemap: true,
    plugins: [
      esbuildPluginTsc({
        force: true,
      }),
    ],
    ...options,
  };

  function bannerLog(banner, always = "") {
    if (doLog) {
      return {
        js: banner + always,
      };
    } else {
      return always
        ? {
            js: always,
          }
        : {};
    }
  }

  // Generate build configs for each entry point
  const configs = entryPoints.map((entryPoint) => {
    const filename = path.basename(entryPoint, ".ts");

    const builds = [];

    const esmConfig = {
      ...commonSettings,
      outfile: `dist/test/${filename}.esm.js`,
      format: "esm",
      platform: "node",
      entryPoints: [entryPoint],
       
      plugins: [...commonSettings.plugins],
      banner: bannerLog(
        `
console.log('fb esm/node build');`,
        `
import { createRequire } from 'module'; 
const require = createRequire(import.meta.url);
        `,
      ),
    };

    const testEsmConfig = {
      ...esmConfig,
      platform: "node",
       
      plugins: [
        ...esmConfig.plugins,
        alias({
          "ipfs-utils/src/http/fetch.js": join(
            __dirname,
            "../../../node_modules/.pnpm/ipfs-utils@9.0.14/node_modules/ipfs-utils/src/http/fetch.node.js",
          ),
          // './store-browser': join(__dirname, '../src/store-fs.ts'),
          "./eb-web": join(__dirname, "../src/eb-node.ts"),
        }),
        commonjs({ filter: /^peculiar|ipfs-utils/ }),
        // polyfillNode({
        //   polyfills: { crypto: false, fs: true, process: 'empty' }
        // })
      ],
      banner: bannerLog(
        `
      console.log('tfp esm/node build');`,
        `
      import { createRequire } from 'module'; 
      const require = createRequire(import.meta.url);
              `,
      ),
    };

    const memEsmConfig = {
      ...esmConfig,
      // platform: 'node',
       
      plugins: [
        ...esmConfig.plugins,
        alias({
          // 'ipfs-utils/src/http/fetch.js': join(__dirname, '../../../node_modules/.pnpm/ipfs-utils@9.0.14/node_modules/ipfs-utils/src/http/fetch.node.js'),
          // './store-browser': join(__dirname, '../src/store-memory.ts'),
          "./eb-web": join(__dirname, "../src/eb-node.ts"),
        }),
        commonjs({ filter: /^peculiar|ipfs-utils/ }),
        // polyfillNode({
        //   polyfills: { crypto: false, fs: true, process: 'empty' }
        // })
      ],
      banner: {},
    };

    builds.push(testEsmConfig);

    if (/fireproof\./.test(entryPoint)) {
      const esmPublishConfig = {
        ...testEsmConfig,
        outfile: `dist/node/${filename}.esm.js`,
        entryPoints: [entryPoint],
        minify: false,
        platform: "node",
      };
      builds.push(esmPublishConfig);

      const memConfig = {
        ...memEsmConfig,
        outfile: `dist/memory/${filename}.esm.js`,
        format: "esm",
        platform: "browser",
        entryPoints: [entryPoint],
      };

      builds.push(memConfig);

      const cjsConfig = {
        ...testEsmConfig,
        outfile: `dist/node/${filename}.cjs`,
        format: "cjs",
        platform: "node",
        entryPoints: [entryPoint],

        banner: bannerLog`
console.log('cjs/node build');
`,
      };
      builds.push(cjsConfig);

      console.log("filename - browser", filename);
      // popular builds inherit here
      const browserIIFEConfig = {
        ...commonSettings,
        outfile: `dist/browser/${filename}.iife.js`,
        format: "iife",
        globalName: "Fireproof",
        platform: "browser",
        target: "es2020",
        entryPoints: [entryPoint],

        banner: bannerLog`
console.log('fp browser/es2015 build');
`,
        plugins: [
          // alias(
          //   {
          //     './store-fs': join(__dirname, '../src/store-browser.ts')
          //   }
          // ),
          // polyfillNode({
          //   // todo remove crypto and test
          //   polyfills: { crypto: false, fs: false, process: 'empty' }
          // }),
          // alias({
          //   crypto: 'crypto-browserify'
          // }),
           
          ...commonSettings.plugins,
        ],
      };

      builds.push(browserIIFEConfig);

      // create react app uses this
      const browserESMConfig = {
        ...browserIIFEConfig,
        outfile: `dist/browser/${filename}.esm.js`,
        format: "esm",

        banner: bannerLog`
console.log('fp esm/es2015 build');
`,
      };

      builds.push(browserESMConfig);

      // most popular
      const browserCJSConfig = {
        ...browserIIFEConfig,
        outfile: `dist/browser/${filename}.cjs`,
        format: "cjs",

        banner: bannerLog`
console.log('fp cjs/es2015 build');
`,
      };
      builds.push(browserCJSConfig);
    }

    return builds;
  });

  return configs.flat();
}

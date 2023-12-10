/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import esbuildPluginTsc from 'esbuild-plugin-tsc'
import alias from 'esbuild-plugin-alias'
import fs from 'fs'
import path, { dirname, join } from 'path'
import flow from 'esbuild-plugin-flow';
// import { polyfillNode } from 'esbuild-plugin-polyfill-node'
import { commonjs } from '@hyrious/esbuild-plugin-commonjs'

import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Obtain all .ts files in the src directory
const entryPoints = fs
  .readdirSync('src')
  .filter(file => path.extname(file) === '.ts')
  .map(file => path.join('src', file))

const doMinify = false
const doLog = false

export function createBuildSettings(options) {
  const commonSettings = {
    entryPoints,
    bundle: true,
    minify: doMinify,
    sourcemap: true,
    plugins: [
      esbuildPluginTsc({
        force: true
      })
    ],
    external: [
      'react',
      'react/jsx-runtime',
      'react-dom',
      'react-native',
      'react-native-fs',
      'react-native-quick-base64',
      'react-native-quick-crypto',
      'react-native-mmkv-storage',
      "@craftzdog/react-native-buffer",
    ],
    ...options,
  };

  function bannerLog(banner, always = '') {
    if (doLog) {
      return {
        js: banner + always
      }
    } else {
      return always
        ? {
            js: always
          }
        : {}
    }
  }

  // Generate build configs for each entry point
  const configs = entryPoints.map(entryPoint => {
    const filename = path.basename(entryPoint, '.ts')

    const builds = []

    const esmConfig = {
      ...commonSettings,
      outfile: `dist/test/${filename}.esm.js`,
      format: 'esm',
      platform: 'node',
      entryPoints: [entryPoint],
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      plugins: [...commonSettings.plugins],
      banner: bannerLog(`
console.log('esm/node build');`, `
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
        `)
    }

    const testEsmConfig = {
      ...esmConfig,
      platform: 'node',
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      plugins: [...esmConfig.plugins,
        // reactNative(),
        flow(),
        alias(
          {
            'ipfs-utils/src/http/fetch.js': join(__dirname, '../../../node_modules/.pnpm/ipfs-utils@9.0.14/node_modules/ipfs-utils/src/http/fetch.node.js'),
            './store-browser': join(__dirname, '../src/store-fs.ts'),
            './crypto-web': join(__dirname, '../src/crypto-node.ts')
          }
        ),
        commonjs({ filter: /^peculiar|ipfs-utils/ })
        // polyfillNode({
        //   polyfills: { crypto: false, fs: true, process: 'empty' }
        // })
      ]

    }


    const memEsmConfig = {
      ...esmConfig,
      // platform: 'node',
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      plugins: [...esmConfig.plugins,
        alias(
          {
            // 'ipfs-utils/src/http/fetch.js': join(__dirname, '../../../node_modules/.pnpm/ipfs-utils@9.0.14/node_modules/ipfs-utils/src/http/fetch.node.js'),
            './store-browser': join(__dirname, '../src/store-memory.ts'),
            // './crypto-web': join(__dirname, '../src/crypto-node.ts')
          }
        ),
        commonjs({ filter: /^peculiar|ipfs-utils/ })
        // polyfillNode({
        //   polyfills: { crypto: false, fs: true, process: 'empty' }
        // })

      ], banner: {}

    }

    builds.push(testEsmConfig)

    if (/fireproof\./.test(entryPoint)) {
      const esmPublishConfig = {
        ...testEsmConfig,
        outfile: `dist/node/${filename}.esm.js`,
        entryPoints: [entryPoint],
        minify: false
      }
      builds.push(esmPublishConfig)

      const memConfig = {
        ...memEsmConfig,
        outfile: `dist/memory/${filename}.esm.js`,
        format: 'esm',
        platform: 'browser',
        entryPoints: [entryPoint]}

        builds.push(memConfig)


      const cjsConfig = {
        ...testEsmConfig,
        outfile: `dist/node/${filename}.cjs`,
        format: 'cjs',
        platform: 'node',
        entryPoints: [entryPoint],
        banner: bannerLog`
console.log('cjs/node build');
`
      }
      builds.push(cjsConfig)

      // popular builds inherit here
      const browserIIFEConfig = {
        ...commonSettings,
        outfile: `dist/browser/${filename}.iife.js`,
        format: 'iife',
        globalName: 'Fireproof',
        platform: 'browser',
        target: 'es2020',
        entryPoints: [entryPoint],

        banner: bannerLog`
console.log('browser/es2015 build');
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
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          ...commonSettings.plugins
        ]
      }

      builds.push(browserIIFEConfig)

      // create react app uses this
      const browserESMConfig = {
        ...browserIIFEConfig,
        outfile: `dist/browser/${filename}.esm.js`,
        format: 'esm',

        banner: bannerLog`
console.log('esm/es2015 build');
`
      }

      builds.push(browserESMConfig)

      // most popular
      const browserCJSConfig = {
        ...browserIIFEConfig,
        outfile: `dist/browser/${filename}.cjs`,
        format: 'cjs',

        banner: bannerLog`
console.log('cjs/es2015 build');
`
      }
      builds.push(browserCJSConfig)

      // react native
      const reactNativeEsmConfig = {
        ...esmConfig,
        outfile: `dist/react-native/${filename}.esm.js`,
        format: 'esm',
        plugins: [...esmConfig.plugins,
          // myPlugin(),
          alias(
            {
              'crypto': join(__dirname, '../node_modules/react-native-quick-crypto/lib/module/index.js'),
              'stream': join(__dirname, '../node_modules/readable-stream/lib/ours/index.js'),
              'buffer': join(__dirname, '../node_modules/@craftzdog/react-native-buffer/index.js'),
              './buffer-reader.js': join(__dirname, '../node_modules/@ipld/car/src/buffer-reader-browser.js'),
              './reader.js': join(__dirname, '../node_modules/@ipld/car/src/reader-browser.js'),
              './writer.js': join(__dirname, '../node_modules/@ipld/car/src/writer-browser.js'),
              './store-browser': join(__dirname, '../src/store-native.ts'),
              'react-native-quick-base64': join(__dirname, '../node_modules/react-native-quick-base64/src/index.tsx'),
              'events': join(__dirname, '../node_modules/events/events.js'),
              'string_decoder': join(__dirname, '../node_modules/string_decoder/lib/string_decoder.js'),
              'util': join(__dirname, '../node_modules/util/util.js'),
              }),
        ],
        inject: [join(__dirname, './react-native-polyfill-globals.js')],
        banner: bannerLog`console.log('react-native ESM build');`,
      };

      builds.push(reactNativeEsmConfig);

      const reactNativeCjsConfig = {
        ...reactNativeEsmConfig,
        outfile: `dist/react-native/${filename}.cjs`,
        format: 'cjs',
        banner: bannerLog`console.log('react-native CJS build');`,
      };
      builds.push(reactNativeCjsConfig);
    }

    return builds
  })

  return configs.flat()
}

// used for debugging/development
const myPlugin = () => {
  return {
    name: 'my-plugin',
    setup(build) {
      build.onResolve({ filter: /./ }, (args) => {
        if (args.path.includes('react-native-quick-base64')) {
          const target = ''; //path.;
          // console.log(args.importer, args.path, target);
          return { path: target };
        }
      })
    },
  };
};

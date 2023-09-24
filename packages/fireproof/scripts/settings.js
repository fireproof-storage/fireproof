/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import esbuildPluginTsc from 'esbuild-plugin-tsc'
import alias from 'esbuild-plugin-alias'
import fs from 'fs'
import path, { dirname, join } from 'path'
// import { polyfillNode } from 'esbuild-plugin-polyfill-node'
import { commonjs } from '@hyrious/esbuild-plugin-commonjs'

import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Obtain all .ts files in the src directory
const entryPoints = fs
  .readdirSync('src')
  .filter(file => path.extname(file) === '.ts')
  .map(file => path.join('src', file))

export function createBuildSettings(options) {
  const commonSettings = {
    entryPoints,
    bundle: true,
    sourcemap: true,
    plugins: [
      esbuildPluginTsc({
        force: true
      })
    ],
    ...options
  }

  const doLog = false
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

    builds.push(testEsmConfig)

    if (/fireproof\./.test(entryPoint)) {
      const esmPublishConfig = {
        ...esmConfig,
        outfile: `dist/node/${filename}.esm.js`,
        entryPoints: [entryPoint],
        minify: true
      }
      builds.push(esmPublishConfig)

      const cjsConfig = {
        ...commonSettings,
        outfile: `dist/node/${filename}.cjs`,
        format: 'cjs',
        platform: 'node',
        entryPoints: [entryPoint],
        minify: true,
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
        minify: false,
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
        minify: true,
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
        minify: true,
        banner: bannerLog`
console.log('cjs/es2015 build');
`
      }
      builds.push(browserCJSConfig)
    }

    return builds
  })

  return configs.flat()
}

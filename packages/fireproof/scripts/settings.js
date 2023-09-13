/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import esbuildPluginTsc from 'esbuild-plugin-tsc'
import alias from 'esbuild-plugin-alias'
import fs from 'fs'
import path, { dirname, join } from 'path'
import { polyfillNode } from 'esbuild-plugin-polyfill-node'
import { commonjs } from '@hyrious/esbuild-plugin-commonjs'

import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Obtain all .ts files in the src directory
const entryPoints = fs
  .readdirSync('src')
  .filter(file => path.extname(file) === '.ts')
  .map(file => path.join('src', file))

export function createBuildSettings(options) {

  //A good video to understand these configurations of esbuild- https://www.youtube.com/watch?v=2VtEDCz0vzQ
  //The commonsetting include
  //- the ts files to be included in the build process
  //- whether to bundle these files or not
  // generating source maps for these files. Learn more about source maps here-https://www.youtube.com/watch?v=FIYkjjFYvoI
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

    //The outfile specifies the name of the files after they are transpiled
    //esbuild recommends using the es2015+ format as compared to the commonjs one that it doesn't support
    //banner is used to insert an arbitrary string at the beginning of generated JavaScript and CSS files
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
    //What is alias?
    //This feature lets you substitute one package for another when bundling.
    // The example below substitutes the package oldpkg with the package newpkg:
    //esbuild app.js --bundle --alias:oldpkg=newpkg
    //These new substitutions happen first before all of esbuild's other path resolution logic.
    // One use case for this feature is replacing a node-only package with a browser-friendly package in third-party code that you don't control.
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

    // if (/encrypted-block\./.test(entryPoint)) {
    //   const nodecryptoConfig={
    //     ...esmConfig,
    //     //Two options? Not sure which one would work
    //     //1st
    //     esmConfig.banner.push(`import { Crypto } from '@peculiar/webcrypto'`),

    //     //2nd
    //     // banner:bannerLog(
    //     //   `import { Crypto } from '@peculiar/webcrypto'`
    //     // )
    //   }
    // }

    if (/fireproof\./.test(entryPoint)) {
      const esmPublishConfig = {
        // ...nodecryptoConfig,
        ...esmConfig,
        outfile: `dist/node/${filename}.esm.js`,
        entryPoints: [entryPoint]
      }
      builds.push(esmPublishConfig)

      const cjsConfig = {
        ...commonSettings,
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
    }

    return builds
  })

  return configs.flat()
}

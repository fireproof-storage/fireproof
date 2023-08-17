/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import esbuildPluginTsc from 'esbuild-plugin-tsc'
// import alias from 'esbuild-plugin-alias'
import fs from 'fs'
import path from 'path'
import { polyfillNode } from 'esbuild-plugin-polyfill-node'

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
      banner: {
        js: `
console.log('esm/node build');
import { createRequire } from 'module'; 
const require = createRequire(import.meta.url);
        `
      }
    }

    builds.push(esmConfig)

    if (/fireproof\.|database\.|index\./.test(entryPoint)) {
      const esmPublishConfig = {
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
        banner: {
          js: `
console.log('cjs/node build');
`
        }
      }
      builds.push(cjsConfig)

      const browserIIFEConfig = {
        ...commonSettings,
        outfile: `dist/browser/${filename}.iife.js`,
        format: 'iife',
        globalName: 'Fireproof',
        platform: 'browser',
        target: 'es2015',
        entryPoints: [entryPoint],
        banner: {
          js: `
console.log('browser/es2015 build');
`
        },
        plugins: [
          polyfillNode({
            polyfills: { crypto: true, fs: true, process: 'empty' }
          }),
          // alias({
          //   crypto: 'crypto-browserify'
          // }),
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          ...commonSettings.plugins
        ]
      }

      builds.push(browserIIFEConfig)

      const browserESMConfig = {
        ...browserIIFEConfig,
        outfile: `dist/browser/${filename}.esm.js`,
        format: 'esm',
        banner: { // should this include createRequire?
          js: `
console.log('esm/es2015 build');
`
        }
      }

      builds.push(browserESMConfig)

      const browserCJSConfig = {
        ...browserIIFEConfig,
        outfile: `dist/browser/${filename}.cjs`,
        format: 'cjs',
        banner: {
          js: `
console.log('cjs/es2015 build');
`
        }
      }
      builds.push(browserCJSConfig)
    }

    return builds
  })

  return configs.flat()
}

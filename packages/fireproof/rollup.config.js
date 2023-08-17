import autoExternal from 'rollup-plugin-auto-external'
import alias from '@rollup/plugin-alias'
import pjson from '@rollup/plugin-json'
import dts from 'rollup-plugin-dts'
// import esbuild from 'rollup-plugin-esbuild'
import nodePolyfills from 'rollup-plugin-polyfill-node'
import resolve from '@rollup/plugin-node-resolve'
import commonJS from '@rollup/plugin-commonjs'
import { visualizer } from 'rollup-plugin-visualizer'

// @rollup/plugin-commonjs

import pkg from './package.json' // assert { type: 'json' } // eslint-disable-line
import { auto } from 'async'

const name = pkg.main.replace(/\.js$/, '')

const bundle = config => ({
  ...config,
  input: 'src/fireproof.js'
  // external: id => !/^[./]/.test(id)
})

export default [
  bundle({
    define: {
      process: '({})'
    },
    plugins: [
      // esbuild(),
      pjson(),
      alias({
        entries: [
          { find: 'crypto', replacement: 'crypto-browserify' }
        ]
      }),
      nodePolyfills({
        // Whether to polyfill `node:` protocol imports.
        // crypto: true,
        protocolImports: false
      }),
      // resolve({ modulesOnly: true }),
      commonJS(),
      resolve({ browser: true, preferBuiltins: false }),
      // commonJS({ include: ['src','node_modules/**'] }),
      // autoExternal()
      // commonJS()
      visualizer()

    ],
    output: [
      {
        file: `${name}.js`,
        format: 'cjs',
        sourcemap: true,
        inlineDynamicImports: true
      },
      {
        file: `${name}.mjs`,
        format: 'es',
        // preserveModules: true,
        sourcemap: true,
        inlineDynamicImports: true
      }
    ]
  }),
  bundle({
    plugins: [dts()],
    output: {
      file: `${name}.d.ts`,
      format: 'es'
    }
  })
]

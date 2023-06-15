import { uglify } from 'rollup-plugin-uglify'
import typescript from 'rollup-plugin-typescript2'

import pkg from './package.json'

export default {
  input: 'src/index.ts',
  output: [
    {
      file: pkg.main,
      format: 'cjs',
      exports: 'named',
      sourcemap: true,
      strict: false
    },
    {
      file: pkg.main.replace(/\.js$/, '.mjs'),
      format: 'es',
      // preserveModules: true,
      sourcemap: true,
      inlineDynamicImports: true
    }
  ],
  plugins: [typescript(), uglify()],
  external: ['react', 'react-dom']
}

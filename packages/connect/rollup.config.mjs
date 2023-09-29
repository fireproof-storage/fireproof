import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json'

import {customRollupPluginTypescript, customRollupPluginCommonjs} from './rollup-hack.mjs';

import { fileURLToPath } from 'url';
import path, { dirname } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, './package.json'), 'utf-8'));

export default {
  input: 'src/index.ts', // replace with the entry point of your package
  output: [
    {
      file: pkg.main,
      format: 'cjs',
    },
    {
      file: pkg.module,
      format: 'esm',
    },
  ],
  plugins: [
    customRollupPluginTypescript(),
    resolve(),
    json(),
    customRollupPluginCommonjs(),
  ],
};

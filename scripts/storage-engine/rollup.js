 
 
import path from "path";
import alias from "@rollup/plugin-alias";
import nodePolyfills from "rollup-plugin-polyfill-node";
import resolve from "@rollup/plugin-node-resolve";
import commonJS from "@rollup/plugin-commonjs";
import { visualizer } from "rollup-plugin-visualizer";
import json from "@rollup/plugin-json";

// Define absolute paths
const projectRoot = path.resolve(process.cwd());
console.log("projectRoot", projectRoot);
const nodeInput = path.join(projectRoot, "dist", "tsc", "fireproof.js");
const browserInput = path.join(projectRoot, "dist", "tsc", "fireproof.js");
const rollupOutput = path.join(projectRoot, "dist", "rollup");

// Common plugins
const commonPlugins = [json(), visualizer()];

// Browser-specific plugins
const browserPlugins = [
  alias({
    entries: [{ find: "crypto", replacement: "crypto-browserify" }],
  }),
  nodePolyfills({
    polyfills: { crypto: true, fs: true, process: "empty" },
    protocolImports: false,
  }),
  commonJS(),
  resolve({ browser: true, preferBuiltins: false }),
];

export default [
  // Node CJS build
  {
    input: nodeInput,
    plugins: [...commonPlugins],
    output: {
      file: path.join(rollupOutput, "node", "fireproof.cjs"),
      format: "cjs",
      banner: 'console.log("Node CJS build");',
      sourcemap: true,
    },
  },

  // Node ESM build
  {
    input: nodeInput,
    plugins: [...commonPlugins],
    output: {
      file: path.join(rollupOutput, "node", "fireproof.esm.js"),
      format: "es",
      banner: 'console.log("Node ESM build");',
      sourcemap: true,
    },
  },

  // Browser IIFE build
  {
    input: browserInput,
    plugins: [...commonPlugins, ...browserPlugins],
    output: {
      file: path.join(rollupOutput, "browser", "fireproof.iife.js"),
      format: "iife",
      name: "Fireproof",
      banner: 'console.log("Browser IIFE build");',
      sourcemap: true,
    },
  },

  // Browser ESM build
  {
    input: browserInput,
    plugins: [...commonPlugins, ...browserPlugins],
    output: {
      file: path.join(rollupOutput, "browser", "fireproof.esm.js"),
      format: "es",
      banner: 'console.log("Browser ESM build");',
      sourcemap: true,
    },
  },

  // Browser CJS build
  {
    input: browserInput,
    plugins: [...commonPlugins, ...browserPlugins],
    output: {
      file: path.join(rollupOutput, "browser", "fireproof.cjs"),
      format: "cjs",
      banner: 'console.log("Browser ESM build");',
      sourcemap: true,
    },
  },
];

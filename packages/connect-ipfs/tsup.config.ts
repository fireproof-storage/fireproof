import { defineConfig } from 'tsup';

/*
By default tsup bundles all import-ed modules but, dependencies and peerDependencies in your package.json are always excluded. 
You can also use --external <module|pkgJson> flag to mark other packages or other special package.json's dependencies and peerDependencies as external.

If you are using tsup to build for Node.js applications/APIs, usually bundling dependencies is not needed, 
and it can even break things, for instance, while outputting to ESM.
*/
export default defineConfig({
  name: "@fireproof/ipfs",
  // Entry file for your library
  entryPoints: ['src/index.ts'],

  // Output directory for the bundled files
  outDir: 'dist',

  // Format options for ESM and UMD bundles
  format: ['esm', 'cjs', 'iife'],

  // Enable TypeScript type generation
  dts: true,
  clean: true,
  sourcemap: true,
  minify: true,

  /** Always bundle modules matching given patterns */
  noExternal: [],
  /** Don't bundle these modules */
  external: [],
});
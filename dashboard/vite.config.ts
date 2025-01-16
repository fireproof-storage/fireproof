import rollupReplace from "@rollup/plugin-replace";
import react from "@vitejs/plugin-react";
import * as path from "node:path";
import { defineConfig } from "vite";
// import { visualizer } from 'rollup-plugin-visualizer';

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    port: 3000,
  },
  // build: {
  //   rollupOptions: {
  //     // external: ['use-fireproof'],
  //     output: {
  //       // inlineDynamicImports: true
  //     },
  //   },
  // },
  // esbuild: {
  //   minifyIdentifiers: false,
  //   keepNames: true,
  // },
  //esbuild: {
  //  minifyIdentifiers: false,
  //},
  build: {
    sourcemap: true,
    target: "esnext",
    outDir: "./dist/static",
    emptyOutDir: true, // also necessary
  },
  plugins: [
    /*
    rollupReplace({
      preventAssignment: true,
      values: {
        "process.env.NODE_ENV": JSON.stringify("development"),
      },
    }),
*/
    react(),
    //    visualizer({ open: true })
  ],
  resolve: process.env.USE_SOURCE
    ? {
        alias: {
          "react-router": path.resolve(__dirname, "../../packages/react-router/index.ts"),
          "react-router-dom": path.resolve(__dirname, "../../packages/react-router-dom/index.tsx"),
        },
      }
    : {},
});

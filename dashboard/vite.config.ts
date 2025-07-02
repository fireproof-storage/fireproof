import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { visualizer } from "rollup-plugin-visualizer";
import * as path from "node:path";

import { cloudflare } from "@cloudflare/vite-plugin";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    // multilines
    // tsconfigPaths(),
    react(),
    cloudflare(),
    visualizer(),
  ],
  build: {
    sourcemap: true,
    target: "esnext",
    outDir: "./dist/static",
    emptyOutDir: true, // also necessary
    manifest: true,
    rollupOptions: {
      external: [".dev.vars"],
    },
  },
  server: {
    port: 7370,
    hmr: false,
    proxy: {
      "/*": {
        rewrite: () => "/index.html",
      },
    },
  },
  resolve: process.env.USE_SOURCE
    ? {
        alias: {
          "react-router": path.resolve(__dirname, "../../packages/react-router/index.js"),
          "react-router-dom": path.resolve(__dirname, "../../packages/react-router-dom/index.jsx"),
        },
      }
    : {},
});

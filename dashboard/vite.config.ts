import react from "@vitejs/plugin-react";
import * as path from "node:path";
import { defineConfig } from "vite";
import { visualizer } from "rollup-plugin-visualizer";

import { cloudflare } from "@cloudflare/vite-plugin";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    // multilines
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
    port: 3000,
    hmr: false,
    proxy: {
      "/*": {
        rewrite: (path) => "/index.html",
      },
    },
  },
  resolve: process.env.USE_SOURCE
    ? {
        alias: {
          "react-router": path.resolve(__dirname, "../../packages/react-router/index.ts"),
          "react-router-dom": path.resolve(__dirname, "../../packages/react-router-dom/index.tsx"),
        },
      }
    : {},
});

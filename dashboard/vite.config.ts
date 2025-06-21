import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { visualizer } from "rollup-plugin-visualizer";
import * as path from "node:path";

import { cloudflare } from "@cloudflare/vite-plugin";
import tsconfigPaths from "vite-tsconfig-paths";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    // multilines
    tsconfigPaths(),
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
      "/fp/cloud/api": {
        target: "http://localhost:7370",
        changeOrigin: true,

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

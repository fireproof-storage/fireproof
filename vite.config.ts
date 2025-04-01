import react from "@vitejs/plugin-react";
import * as path from "node:path";
import { defineConfig } from "vite";
// import { visualizer } from 'rollup-plugin-visualizer';

// import { cloudflare } from "@cloudflare/vite-plugin";

import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  server: {
    port: 3000,
    hmr: false,
  },
  build: {
    sourcemap: true,
    target: "esnext",
    outDir: "./dist/static",
    emptyOutDir: true, // also necessary
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

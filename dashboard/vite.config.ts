import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { visualizer } from "rollup-plugin-visualizer";
import { dotenv } from "zx";
import { cloudflare } from "@cloudflare/vite-plugin";
import * as path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    // multilines
    // tsconfigPaths(),
    react(),
    cloudflare(),
    visualizer(),
  ],
  define: {
    ...Object.entries(dotenv.load(".dev.vars")).reduce(
      (acc, [key, value]) => {
        // Double stringify: once to make it a string, twice to make it a JSON string literal
        acc[`import.meta.env.${key}`] = JSON.stringify(value);
        return acc;
      },
      {} as Record<string, string>,
    ),
  },
  build: {
    sourcemap: true,
    target: "esnext",
    outDir: "./dist/static",
    emptyOutDir: true, // also necessary
    manifest: true,
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

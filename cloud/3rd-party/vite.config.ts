import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    react({
      jsxRuntime: "classic", // Use classic instead of automatic
    }),
  ],
  build: {
    sourcemap: true,
    target: "esnext",
    outDir: "./dist",
    emptyOutDir: true, // also necessary
    manifest: true,
    rollupOptions: {
      external: [".dev.vars"],
    },
  },
  resolve: {
    extensions: [".ts", ".tsx", ".js", ".jsx"],
    // This makes Vite try .ts if .js doesn't exist
  },
  server: {
    port: 3001,
    hmr: true,
    proxy: {
      "/*": {
        rewrite: () => "/index.html",
      },
    },
  },
});

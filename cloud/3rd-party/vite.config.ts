import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    react()
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

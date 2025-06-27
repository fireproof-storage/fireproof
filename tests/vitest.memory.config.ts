import { defineConfig } from "vitest/config";

import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    name: "memory",
    exclude: ["react/**", "gateway/indexeddb", "gateway/file", "blockstore/keyed-crypto-indexeddb-file.test.ts"],
    include: ["**/*test.?(c|m)[jt]s?(x)"],
    globals: true,
    setupFiles: "./setup.memory.ts",
  },
});

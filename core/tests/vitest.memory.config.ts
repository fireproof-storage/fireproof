import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "memory",
    exclude: [
      "dist/**",
      "node_modules/**",
      "react/**",
      "**/smoke/**",
      "**/scripts/**",
      "**/examples/**",
      "gateway/indexeddb",
      "gateway/file",
      "blockstore/keyed-crypto-indexeddb-file.test.ts",
    ],
    include: ["**/*test.?(c|m)[jt]s?(x)"],
    coverage: {
      exclude: ["**/smoke/**", "**/scripts/**", "**/examples/**"],
    },
    globals: true,
    setupFiles: "./setup.memory.ts",
  },
});

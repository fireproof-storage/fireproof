import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "memory",
    exclude: [
      "tests/gateway/indexdb",
      "tests/gateway/file",
      "tests/blockstore/keyed-crypto-indexdb-file.test.ts",
    ],
    include: ["tests/**/*test.?(c|m)[jt]s?(x)"],
    globals: true,
    setupFiles: "./setup.memory.js",
  },
});

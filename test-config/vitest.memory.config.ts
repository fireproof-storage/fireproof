import { defineConfig } from "vitest/config";

import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    name: "memory",
    exclude: [
      "tests/react/**",
      "**/smoke/**",
      "**/scripts/**",
      "**/examples/**",
      "tests/gateway/indexeddb",
      "tests/gateway/file",
      "tests/blockstore/keyed-crypto-indexeddb-file.test.ts",
    ],
    include: ["tests/**/*test.?(c|m)[jt]s?(x)"],
    coverage: {
      exclude: ["**/smoke/**", "**/scripts/**", "**/examples/**"],
    },
    globals: true,
    setupFiles: "./test-config/setup.memory.js",
  },
});

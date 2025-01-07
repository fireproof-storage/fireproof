import { defineConfig, Plugin } from "vitest/config";

import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths() as Plugin],
  test: {
    name: "memory",
    exclude: [
      "tests/react/**",
      "**/smoke/**",
      "**/scripts/**",
      "**/examples/**",
      "tests/gateway/indexdb",
      "tests/gateway/file",
      "tests/blockstore/keyed-crypto-indexdb-file.test.ts",
    ],
    include: ["tests/**/*test.?(c|m)[jt]s?(x)"],
    coverage: {
      exclude: ["**/smoke/**", "**/scripts/**", "**/examples/**"],
    },
    globals: true,
    setupFiles: "./setup.memory.js",
  },
});

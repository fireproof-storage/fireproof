import { defineConfig } from "vitest/config";

import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    name: "cloud:libsql",
    exclude: [
      "tests/react/**",
      "**/smoke/**",
      "**/scripts/**",
      "**/examples/**",
      "tests/gateway/indexeddb",
      "tests/gateway/file",
      "tests/blockstore/keyed-crypto-indexeddb-file.test.ts",
      "cloud/backend/meta-merger/**",
    ],
    include: ["xtests/**/*test.?(c|m)[jt]s?(x)", "cloud/**/*test.?(c|m)[jt]s?(x)"],
    coverage: {
      exclude: ["**/smoke/**", "**/scripts/**", "**/examples/**"],
    },
    globals: true,
    globalSetup: "./cloud/backend/node/globalSetup.cloud.libsql.ts",
    setupFiles: "./cloud/backend/node/setup.cloud.libsql.js",
  },
});

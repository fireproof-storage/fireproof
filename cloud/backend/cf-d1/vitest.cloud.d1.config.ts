import { defineConfig } from "vitest/config";

import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    name: "cloud:d1",
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
    // WARNING TODO the hole suite is not working
    include: ["xtests/**/*test.?(c|m)[jt]s?(x)", "cloud/**/*test.?(c|m)[jt]s?(x)"],
    coverage: {
      exclude: ["**/smoke/**", "**/scripts/**", "**/examples/**"],
    },
    globals: true,
    globalSetup: "./cloud/backend/cf-d1/globalSetup.cloud.d1.ts",
    setupFiles: "./cloud/backend/cf-d1/setup.cloud.d1.js",
  },
});

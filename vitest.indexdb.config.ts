// import { defineConfig } from "vite";
import { defineConfig, Plugin } from "vitest/config";

import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths() as Plugin],
  test: {
    name: "indexdb",
    exclude: ["examples/**", "tests/gateway/file"],
    include: ["tests/**/*test.?(c|m)[jt]s?(x)"],
    browser: {
      enabled: true,
      headless: true,
      provider: "webdriverio",
      name: process.env.FP_BROWSER || "chrome", // browser name is required
    },
    globals: true,
    setupFiles: "./setup.indexdb.ts",
  },
});

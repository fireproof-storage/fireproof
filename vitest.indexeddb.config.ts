/// <reference types="@vitest/browser/providers/playwright" />
/// <reference types="@vitest/browser/providers/webdriverio" />

import { defineConfig } from "vite";

import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    name: "indexeddb",
    exclude: ["examples/**", "tests/gateway/file"],
    include: ["tests/**/*test.?(c|m)[jt]s?(x)"],
    browser: {
      enabled: true,
      headless: true,
      provider: "webdriverio",
      name: process.env.FP_BROWSER || "chrome", // browser name is required
      // instances: [
      //   {
      //     browser: process.env.FP_BROWSER || "chrome", // browser name is required
      //   },
      // ],
    },
    globals: true,
    setupFiles: "./setup.indexeddb.ts",
  },
});

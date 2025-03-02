/// <reference types="@vitest/browser/providers/playwright" />
/// <reference types="@vitest/browser/providers/webdriverio" />

import { defineConfig } from "vitest/config";

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
      instances: [
        {
          browser: "chrome",
          //setupFile: './chromium-setup.js',
        },
      ],

      // name: process.env.FP_BROWSER || "chrome", // browser name is required
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

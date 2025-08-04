/// <reference types="@vitest/browser/providers/playwright" />
/// <reference types="@vitest/browser/providers/webdriverio" />

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "indexeddb",
    exclude: ["dist/**", "node_modules/**", "examples/**", "gateway/file"],
    include: ["**/*test.?(c|m)[jt]s?(x)"],
    browser: {
      enabled: true,
      headless: true,
      provider: "playwright",
      // provider: "webdriverio",
      // name: "chrome",
      instances: [
        {
          browser: "chromium",
          //setupFile: './chromium-setup.js',
          context: {
            // Disable screenshots and video recording
            recordVideo: undefined,
            recordHar: undefined,
          },
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

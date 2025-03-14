import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    setupFiles: "./setup.js",
    browser: {
      enabled: true,
      provider: "playwright",
      // provider: "webdriverio",
      headless: true,
      instances: [
        {
          // browser: "chrome",
          browser: "chromium",
        },
      ],
    },
    testTimeout: 30000,
  },
});

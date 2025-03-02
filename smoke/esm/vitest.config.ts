import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    setupFiles: "./setup.js",
    browser: {
      enabled: true,
      provider: "webdriverio",
      headless: true,
      instances: [
        {
          browser: "chrome",
        },
      ],
    },
    testTimeout: 30000,
  },
});

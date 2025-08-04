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
      // Disable screenshots
      providerOptions: {
        use: {
          screenshot: "off",
          video: "off",
        },
      },
    },
    testTimeout: 30000,
  },
});

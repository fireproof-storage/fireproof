import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    browser: {
      enabled: true,
      provider: "webdriverio",
      headless: true,
    },
    testTimeout: 30000,
  },
});

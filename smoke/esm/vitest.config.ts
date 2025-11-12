import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";

export default defineConfig({
  test: {
    globals: true,
    setupFiles: "./setup.js",
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({
        // ...custom playwright options
      }),
      instances: [
        {
          browser: "chromium",
        },
      ],
      screenshotFailures: false,
    },
    testTimeout: 30000,
  },
});

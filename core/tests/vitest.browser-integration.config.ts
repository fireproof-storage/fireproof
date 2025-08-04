/// <reference types="@vitest/browser/providers/playwright" />

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "browser-integration",
    include: ["browser/**/*.test.?(c|m)[jt]s?(x)"],
    exclude: ["dist/**", "node_modules/**"],
    root: "./core/tests",
    browser: {
      enabled: true,
      headless: true,
      provider: "playwright",
      instances: [
        {
          browser: "chromium",
        },
      ],
    },
    globals: true,
    testTimeout: 30000, // Longer timeout for page reloads
  },
});

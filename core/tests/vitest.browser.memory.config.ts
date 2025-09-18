/// <reference types="@vitest/browser/providers/playwright" />
/// <reference types="@vitest/browser/providers/webdriverio" />

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "browser:memory",
    exclude: [
      "dist/**",
      "node_modules/**",
      "examples/**",
      "gateway/file",
      "gateway/indexeddb/create-db-on-write.test.ts",
      "gateway/indexeddb/dexie-transition.test.ts",
    ],
    include: ["**/*test.?(c|m)[jt]s?(x)"],
    browser: {
      enabled: true,
      headless: true,
      provider: "playwright",
      instances: [
        {
          browser: "chromium",
          context: {
            // Disable screenshots and video recording
            recordVideo: undefined,
            recordHar: undefined,
          },
        },
      ],
      screenshotFailures: false,
    },
    setupFiles: "./setup.memory.ts",
  },
});

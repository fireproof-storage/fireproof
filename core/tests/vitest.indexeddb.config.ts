import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";

export default defineConfig({
  test: {
    name: "indexeddb",
    exclude: ["dist/**", "node_modules/**", "examples/**", "gateway/file"],
    include: ["**/*test.?(c|m)[jt]s?(x)"],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [
        {
          browser: "chromium",
        },
      ],
      screenshotFailures: false,
    },
    setupFiles: "./setup.indexeddb.ts",
  },
});

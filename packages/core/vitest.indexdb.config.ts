import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "indexdb",
    exclude: ["tests/gateway/file"],
    include: ["tests/**/*test.?(c|m)[jt]s?(x)"],
    browser: {
      enabled: true,
      headless: true,
      provider: "webdriverio",
      instances: [{
        browser: process.env.FP_BROWSER || "chrome"
      }]
    },
    globals: true,
    setupFiles: "./setup.indexdb.ts",
  },
});

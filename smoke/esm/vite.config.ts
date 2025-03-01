import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    browser: {
      enabled: true,
      name: "chrome",
      headless: true,
      provider: "webdriverio",
    },
    globals: true,
    include: ["src/**/*test.?(c|m)[jt]s?(x)"],
    deps: {
      optimizer: {
        web: { enabled: true },
        ssr: { enabled: true },
      },
    },
    isolate: false,
    testTimeout: 30_000, // 30 seconds
    hookTimeout: 30_000, // 30 seconds
    setupFiles: "./setup.js",
  },
});

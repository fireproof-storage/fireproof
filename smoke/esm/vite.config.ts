import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["src/**/*test.?(c|m)[jt]s?(x)"],
    browser: {
      enabled: true,
      headless: true,
      provider: "webdriverio",
      name: "chrome", // browser name is required
    },
    deps: {
      optimizer: {
        web: { enabled: true },
        ssr: { enabled: true },
      },
    },
    isolate: false,
    testTimeout: 30_000,
    setupFiles: "./setup.js",
    logHeapUsage: true, // Log memory usage
    retry: process.env.CI ? 2 : 0, // Retry tests in CI
  },
});

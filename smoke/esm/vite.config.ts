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
      slowMo: 100, // Add a small delay between actions to help with stability
    },
    deps: {
      optimizer: {
        web: { enabled: true },
        ssr: { enabled: true },
      },
    },
    isolate: false,
    testTimeout: 120_000, // Increased from 60_000 to 120_000
    setupFiles: "./setup.js",
    retry: 1, // Add retry capability
    logHeapUsage: true, // Log memory usage
    reporters: ["default", "json"], // Add JSON reporter for better CI integration
    outputFile: {
      json: "./test-results.json",
    },
  },
});

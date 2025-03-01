import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    browser: {
      enabled: true,
      name: "chrome",
      headless: true,
      provider: "webdriverio",
      options: {
        // Add additional browser options for stability
        args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--window-size=1280,1024", "--start-maximized"],
      },
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
    testTimeout: 60_000, // 60 seconds
    hookTimeout: 60_000, // 60 seconds
    setupFiles: "./setup.js",
  },
});

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
        args: [
          "--no-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--window-size=1920,1080",
          "--start-maximized",
          "--disable-extensions",
          "--disable-popup-blocking",
          "--disable-infobars",
          "--disable-notifications",
          "--disable-background-timer-throttling",
          "--disable-backgrounding-occluded-windows",
          "--disable-breakpad",
          "--disable-component-extensions-with-background-pages",
          "--disable-features=TranslateUI,BlinkGenPropertyTrees",
          "--disable-ipc-flooding-protection",
          "--force-color-profile=srgb",
        ],
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
    testTimeout: 120_000, // 120 seconds
    hookTimeout: 120_000, // 120 seconds
    setupFiles: "./setup.js",
    retry: 2, // Retry failed tests up to 2 times
  },
});

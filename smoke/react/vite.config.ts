import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["src/**/*test.?(c|m)[jt]s?(x)"],
    browser: {
      enabled: true,
      headless: true,
      provider: "playwright",
      // provider: "webdriverio",
      instances: [
        {
          // browser: "chrome",
          browser: "chromium",
        },
      ],
      // name: "chrome", // browser name is required
      // Disable screenshots
      providerOptions: {
        use: {
          screenshot: "off",
          video: "off",
        },
      },
    },
    deps: {
      optimizer: {
        web: { enabled: true },
        ssr: { enabled: true },
      },
    },
    isolate: false,
    //coverage: {
    //  provider: "istanbul",
    //},
  },
});

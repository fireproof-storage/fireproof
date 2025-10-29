import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";

export default defineConfig({
  test: {
    globals: true,
    include: ["src/**/*test.?(c|m)[jt]s?(x)"],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({
        // ...custom playwright options
      }),
      instances: [
        {
          browser: "chromium",
        },
      ],
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

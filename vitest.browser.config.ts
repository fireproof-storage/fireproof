import { defineConfig } from "vite";

import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    name: "indexdb",
    include: ["tests/**/*test.?(c|m)[jt]s?(x)"],
    //    environment: "browser",
    browser: {
      enabled: true,
      headless: true,
      provider: "webdriverio",
      name: "chrome", // browser name is required
    },
    globals: true,
  },
});

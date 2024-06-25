import { defineConfig } from "vite";

import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: ["tests/react/**/*test.?(c|m)[jt]s?(x)"],
    // environment: "happy-dom",
    browser: {
      enabled: true,
      headless: true,
      name: "chrome", // browser name is required
    },
    globals: true,
  },
});

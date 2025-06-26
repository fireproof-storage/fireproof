import { defineConfig } from "vitest/config";

import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    name: "cloud:meta-merge",
    include: ["**/*test.?(c|m)[jt]s?(x)"],
    globals: true,
    globalSetup: "./globalSetup.cloud.meta-merger.ts",
    setupFiles: "./setup.cloud.meta-merger.ts",
  },
});

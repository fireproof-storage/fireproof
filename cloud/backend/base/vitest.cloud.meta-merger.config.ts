import { defineConfig } from "vitest/config";

import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths() as any],
  test: {
    name: "cloud:meta-merge",
    include: ["meta-merger/*test.?(c|m)[jt]s?(x)"],
    globals: true,
    globalSetup: "globalSetup.cloud.meta-merger.ts",
    setupFiles: "setup.cloud.meta-merger.ts",
  },
});

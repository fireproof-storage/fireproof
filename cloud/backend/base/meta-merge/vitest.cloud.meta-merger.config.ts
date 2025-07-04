import { defineConfig } from "vitest/config";

import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    name: "cloud:meta-merge",
    include: ["cloud/backend/meta-merger/*test.?(c|m)[jt]s?(x)"],
    globals: true,
    globalSetup: "./cloud/backend/meta-merger/globalSetup.cloud.meta-merger.ts",
    setupFiles: "./cloud/backend/meta-merger/setup.cloud.meta-merger.ts",
  },
});

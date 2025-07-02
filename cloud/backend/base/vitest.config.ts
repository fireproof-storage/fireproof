import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "cloud:base",
    include: ["meta-merger/*test.?(c|m)[jt]s?(x)"],
    exclude: ["dist/**", "node_modules/**"],
    globalSetup: "globalSetup.cloud.meta-merger.ts",
    setupFiles: "setup.cloud.meta-merger.ts",
  },
});

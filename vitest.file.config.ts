import { defineConfig, Plugin } from "vitest/config";

import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths() as Plugin],
  test: {
    name: "file",
    exclude: ["tests/react/**", "examples/**", "tests/gateway/indexdb"],
    include: ["tests/**/*test.?(c|m)[jt]s?(x)"],
    globals: true,
    setupFiles: "./setup.file.js",
  },
});

import { defineConfig } from "vitest/config";

import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    name: "file",
    exclude: ["tests/react/**", "examples/**", "tests/gateway/indexeddb"],
    include: ["tests/**/*test.?(c|m)[jt]s?(x)"],
    globals: true,
    setupFiles: "./test-config/setup.file.js",
  },
});

import { defineConfig } from "vitest/config";

import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    name: "mem-file",
    exclude: ["tests/react/**", "**/smoke/**", "**/scripts/**", "**/examples/**"],
    include: ["tests/**/*test.?(c|m)[jt]s?(x)"],
    coverage: {
      exclude: ["**/smoke/**", "**/scripts/**", "**/examples/**"],
    },
    globals: true,
    setupFiles: "./setup.mem-file.js",
  },
});

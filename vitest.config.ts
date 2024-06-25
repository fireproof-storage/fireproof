import { defineConfig } from "vite";

import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    exclude: ["tests/react/**"],
    include: ["tests/**/*test.?(c|m)[jt]s?(x)"],
    globals: true,
  },
});

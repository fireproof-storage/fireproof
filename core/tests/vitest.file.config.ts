import { defineConfig } from "vitest/config";

import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  plugins: [tsconfigPaths() as any],
  test: {
    name: "file",
    exclude: ["dist/**", "node_modules/**", "react/**", "examples/**", "gateway/indexeddb"],
    include: ["**/*test.?(c|m)[jt]s?(x)"],
    globals: true,
    setupFiles: "./setup.file.ts",
  },
});

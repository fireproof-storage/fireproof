import { defineConfig } from "vitest/config";

import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    name: "cloud:libsql",
    exclude: ["../meta-merger/**"],
    include: ["../**/*test.?(c|m)[jt]s?(x)"],
    globals: true,
    globalSetup: ["../globalSetup.spin-minio.ts", "./globalSetup.cloud.libsql.ts"],
    setupFiles: "./setup.cloud.libsql.js",
  },
});

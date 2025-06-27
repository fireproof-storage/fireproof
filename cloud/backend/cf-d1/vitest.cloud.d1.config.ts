import { defineConfig } from "vitest/config";

import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    name: "cloud:d1",
    exclude: ["../meta-merger/**"],
    // WARNING TODO the hole suite is not working
    include: ["../**/*test.?(c|m)[jt]s?(x)"],
    globals: true,
    globalSetup: ["../globalSetup.spin-minio.ts", "./globalSetup.cloud.d1.ts"],
    setupFiles: "./setup.cloud.d1.js",
  },
});

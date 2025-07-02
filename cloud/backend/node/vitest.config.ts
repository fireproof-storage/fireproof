import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "cloud:node",
    exclude: ["dist/**", "node_modules/**", "**/smoke/**", "**/scripts/**", "**/examples/**"],
    include: ["tests/**/*test.?(c|m)[jt]s?(x)", "../base/*test.?(c|m)[jt]s?(x)"],
    globalSetup: ["./node_modules/@fireproof/cloud-base/globalSetup.spin-minio.ts", "./globalSetup.cloud.libsql.ts"],
    setupFiles: "./setup.cloud.libsql.js",
  },
});

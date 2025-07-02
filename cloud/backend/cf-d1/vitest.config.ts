import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "cloud:d1",
    exclude: ["dist/**", "node_modules/**", "**/smoke/**", "**/scripts/**", "**/examples/**"],
    include: ["tests/**/*test.?(c|m)[jt]s?(x)", "../base/*test.?(c|m)[jt]s?(x)"],
    globalSetup: ["./node_modules/@fireproof/cloud-base/globalSetup.spin-minio.ts", "./globalSetup.cloud.d1.ts"],
    setupFiles: "./setup.cloud.d1.js",
  },
});

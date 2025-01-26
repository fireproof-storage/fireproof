import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "file",
    exclude: ["tests/gateway/indexdb"],
    include: ["tests/**/*test.?(c|m)[jt]s?(x)"],
    globals: true,
    setupFiles: "./setup.file.js",
  },
});

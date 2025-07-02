import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "core:file",
    exclude: ["dist/**", "node_modules/**", "react/**", "examples/**", "gateway/indexeddb"],
    include: ["**/*test.?(c|m)[jt]s?(x)"],
    globals: true,
    setupFiles: "./setup.file.ts",
  },
});

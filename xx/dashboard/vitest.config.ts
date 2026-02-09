import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "dashboard",
    globals: true,
    globalSetup: "./globalSetup.libsql.ts",
  },
});

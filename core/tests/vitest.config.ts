import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["vitest.file.config.ts", "vitest.memory.config.ts", "vitest.indexeddb.config.ts"],
  },
});

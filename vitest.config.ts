import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "core/tests/vitest.file.config.ts",
      "core/tests/vitest.indexeddb.config.ts",
      "core/tests/vitest.memory.config.ts",

      "use-fireproof/tests/vitest.config.ts",
      "cloud/backend/cf-d1/vitest.config.ts",
      "cloud/backend/node/vitest.config.ts",
      "cloud/backend/base/vitest.config.ts",
      "dashboard/vitest.config.ts",
    ],
  },
});

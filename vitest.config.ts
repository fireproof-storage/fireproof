import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "core/tests/vitest.file.config.ts",
      "core/tests/vitest.indexeddb.config.ts",
      "core/tests/vitest.memory.config.ts",

      "use-fireproof/vitest.config.ts",
      "cloud/backend/cf-d1/vitest.config.ts",
      "cloud/backend/node/vitest.config.ts",
      "cloud/backend/base/vitest.config.ts",
      "cli/vitest.config.ts",
      "dashboard/vitest.config.ts",

      "vendor/level/iota-array/vitest.config.ts",
      "vendor/level/functional-red-black-tree/vitest.config.ts",
      "vendor/level/supports/vitest.config.ts",
      "vendor/level/transcoder/vitest.config.ts",
      "vendor/level/maybe-combine-errors/vitest.config.ts",
      "vendor/level/module-error/vitest.config.ts"
    ],
  },
});

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "tests/vitest.file.config.ts",
      "tests/vitest.memory.config.ts",
      "cloud/backend/node/vitest.cloud.libsql.config.ts",
      "cloud/backend/cf-d1/vitest.cloud.d1.config.ts",
      "cloud/backend/meta-merger/vitest.cloud.meta-merger.config.ts",
      "tests/vitest.indexeddb.config.ts",
    ],
  },
});

// export default defineWorkspace([
//   // force multilines
//   memory,
//   file,
//   indexeddb,
//   cloudD1,
//   cloudLibsql,
//   cloudMetaMerge,
// ]);

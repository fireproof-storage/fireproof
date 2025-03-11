import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "./test-config/vitest.memory.config.ts",
  "./test-config/vitest.file.config.ts",
  "./test-config/vitest.indexeddb.config.ts",
]);

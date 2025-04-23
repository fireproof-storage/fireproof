import { defineWorkspace } from "vitest/config";

// import file from "./tests/vitest.file.config.ts";
import memory from "./tests/vitest.memory.config.js";
import cloudLibsql from "./cloud/backend/node/vitest.cloud.libsql.config.js";
import cloudD1 from "./cloud/backend/cf-d1/vitest.cloud.d1.config.js";
import cloudMetaMerge from "./cloud/backend/meta-merger/vitest.cloud.meta-merger.config.js";
// import indexeddb from "./tests/vitest.indexeddb.config.ts";

export default defineWorkspace([
  // force multilines
  memory,
  //  file,
  //  indexeddb,
  cloudD1,
  cloudLibsql,
  cloudMetaMerge,
]);

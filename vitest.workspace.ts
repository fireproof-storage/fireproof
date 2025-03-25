import { defineWorkspace } from "vitest/config";

import file from "./vitest.file.config.ts";
import memory from "./vitest.memory.config.ts";
import cloudLibsql from "./vitest.cloud.libsql.config.ts";
import cloudD1 from "./vitest.cloud.d1.config.ts";
import indexeddb from "./vitest.indexeddb.config.ts";

export default defineWorkspace([
  // force multilines
  memory,
  file,
  indexeddb,
  cloudD1,
  cloudLibsql,
]);

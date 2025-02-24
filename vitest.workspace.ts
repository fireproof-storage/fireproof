import { defineWorkspace } from "vitest/config";

import file from "./vitest.file.config.ts";
import memory from "./vitest.memory.config.ts";
import indexeddb from "./vitest.indexeddb.config.ts";

export default defineWorkspace([memory, file, indexeddb]);

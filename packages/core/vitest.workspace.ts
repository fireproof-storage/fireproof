import { defineWorkspace } from "vitest/config";

import file from "./vitest.file.config.ts";
import memory from "./vitest.memory.config.ts";
import indexdb from "./vitest.indexdb.config.ts";

export default defineWorkspace([memory, file, indexdb]);

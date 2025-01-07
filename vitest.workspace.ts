import { defineWorkspace } from "vitest/config";

import file from "./vitest.file.config.js";
import memory from "./vitest.memory.config.js";
import indexdb from "./vitest.indexdb.config.js";

export default defineWorkspace([memory, file, indexdb]);

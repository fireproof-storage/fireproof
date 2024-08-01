import { defineWorkspace } from "vitest/config";

import file from "./vitest.file.config.ts";
import mem_file from "./vitest.mem-file.config.ts";
import browser from "./vitest.browser.config.ts";

export default defineWorkspace([
  mem_file,
  file, //, browser
]);

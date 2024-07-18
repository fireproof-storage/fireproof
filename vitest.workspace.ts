import { defineWorkspace } from "vitest/config";

import file from "./vitest.file.config.ts";
import browser from "./vitest.browser.config.ts";

export default defineWorkspace([file, browser]);

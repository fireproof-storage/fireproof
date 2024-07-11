import { defineWorkspace } from "vitest/config";

import sqlite from "./vitest.sqlite.config.ts";
import file from "./vitest.file.config.ts";
import browser from "./vitest.browser.config.ts";

export default defineWorkspace([sqlite, file, browser]);

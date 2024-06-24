import { STORAGE_VERSION } from "../storage-engine/index.js";

import { homedir } from "node:os";
import { join } from "node:path";

export function dataDir(): string {
  return join(homedir(), ".fireproof", "v" + STORAGE_VERSION);
}

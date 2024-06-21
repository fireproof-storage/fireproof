import { STORAGE_VERSION } from "../storage-engine";

import { homedir } from "node:os";
import { join } from "node:path";

export function dataDir(): string {
  return join(homedir(), ".fireproof", "v" + STORAGE_VERSION);
}

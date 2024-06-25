import { STORAGE_VERSION } from "../storage-engine/index.js";
import { SysContainer } from "./sys-container.js";

export function dataDir(): string {
  return SysContainer.join(SysContainer.homedir(), ".fireproof", "v" + STORAGE_VERSION);
}

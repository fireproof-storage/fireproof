import { STORAGE_VERSION } from "../storage-engine/index.js";
import { SysContainer } from "./sys-container.js";
import { isNode } from "std-env";

export function dataDir(): string {
  if (isNode) {
    return SysContainer.join(SysContainer.homedir(), ".fireproof", "v" + STORAGE_VERSION);
  }
  return "indexdb://fireproof/v" + STORAGE_VERSION;
}

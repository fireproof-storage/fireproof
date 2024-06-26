import { STORAGE_VERSION } from "../storage-engine/index.js";
import { SysContainer } from "./sys-container.js";
import { isNode } from "std-env";

export function dataDir(name?: string): string {
  if (isNode) {
    return SysContainer.join(SysContainer.homedir(), ".fireproof", `v${STORAGE_VERSION}`, name || "");
  }
  return SysContainer.join(`indexdb://fireproof/v${STORAGE_VERSION}`, name || "");
}

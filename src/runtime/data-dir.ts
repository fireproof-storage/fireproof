import { STORAGE_VERSION } from "../storage-engine/index.js";
import { SysContainer } from "./sys-container.js";
import { isNode } from "std-env";

export function dataDir(name?: string): string {
  const dataDir = _dataDir(name);
  // console.log("dataDir->", dataDir);
  return dataDir;
}

function _dataDir(name?: string): string {
  if (isNode) {
    // console.log("dataDir->", process.env, name);
    if (process.env.FP_STORAGE_URL) {
      return SysContainer.join(process.env.FP_STORAGE_URL, `v${STORAGE_VERSION}`, name || "");
    }
    return SysContainer.join(SysContainer.homedir(), ".fireproof", `v${STORAGE_VERSION}`, name || "");
  }
  return `indexdb://fp.${STORAGE_VERSION}.${name || ""}`;
}

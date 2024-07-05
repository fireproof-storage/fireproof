import { SysContainer } from "./sys-container.js";
import { isNode } from "std-env";

export function dataDir(name?: string, base?: string | URL): string {
  const dataDir = _dataDir(name, base);
  // console.log("dataDir->", dataDir, name, base);
  return dataDir;
}

function _dataDir(name?: string, base?: string | URL): string {
  if (!base) {
    if (isNode) {
      base = process.env.FP_STORAGE_URL || `file://${SysContainer.join(SysContainer.homedir(), ".fireproof")}`;
    } else {
      base = `indexdb://fp`;
    }
  }
  let url: URL;
  if (typeof base === "string") {
    try {
      url = new URL(base.toString());
    } catch (e) {
      try {
        base = `file://${base}`;
        url = new URL(base);
      } catch (e) {
        throw new Error(`invalid base url: ${base}`);
      }
    }
  } else {
    url = base;
  }
  url.searchParams.set("name", name || "");
  return url.toString();
}

import { runtimeFn, URI } from "@adviser/cement";
import type { SysFileSystem } from "../../../types.js";

export function sysFileSystemFactory(uri: URI): Promise<SysFileSystem> {
  const rt = runtimeFn();
  switch (true) {
    case rt.isNodeIsh:
      return import("@fireproof/core/node").then((m) => m.getSysFileSystem(uri));
    case rt.isDeno:
      return import("@fireproof/core/deno").then((m) => m.getSysFileSystem(uri));
    default:
      throw new Error(`unsupported runtime:${rt}`);
  }
}

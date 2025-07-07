import { runtimeFn, URI } from "@adviser/cement";
import type { SysFileSystem } from "@fireproof/core-types-base";

export function sysFileSystemFactory(uri: URI): Promise<SysFileSystem> {
  const rt = runtimeFn();
  switch (true) {
    case rt.isNodeIsh:
      return import("@fireproof/core-gateways-file-node").then((m) => m.getSysFileSystem(uri));
    case rt.isDeno:
      return import("@fireproof/core-gateways-file-deno").then((m) => m.getSysFileSystem(uri));
    default:
      throw new Error(`unsupported runtime:${rt}`);
  }
}

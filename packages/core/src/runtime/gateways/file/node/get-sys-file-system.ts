import type { SysFileSystem } from "@fireproof/core";
import { NodeFileSystem } from "./node-filesystem.js";
import { ResolveOnce, URI } from "@adviser/cement";

const nfs = new ResolveOnce<SysFileSystem>();
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function getSysFileSystem(url: URI): Promise<SysFileSystem> {
  return nfs.once(async () => {
    const nfs = new NodeFileSystem();
    await nfs.start();
    return nfs;
  });
}

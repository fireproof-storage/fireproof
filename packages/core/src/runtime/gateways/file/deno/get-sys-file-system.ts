import type { SysFileSystem } from "@fireproof/core";
import { DenoFileSystem } from "./deno-filesystem.js";
import { ResolveOnce, URI } from "@adviser/cement";

const nfs = new ResolveOnce<SysFileSystem>();
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function getSysFileSystem(url: URI): Promise<SysFileSystem> {
  return nfs.once(async () => {
    const nfs = new DenoFileSystem();
    await nfs.start();
    return nfs;
  });
}

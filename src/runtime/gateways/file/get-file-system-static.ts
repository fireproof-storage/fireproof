import { KeyedResolvOnce, type URI } from "@adviser/cement";
import type { SysFileSystem } from "../../../types.js";

const externalLoaders = new KeyedResolvOnce<SysFileSystem>();
export async function getFileSystem(url: URI): Promise<SysFileSystem> {
  const name = url.getParam("fs", "node");
  let fs: SysFileSystem;
  switch (name) {
    case "mem":
      fs = await externalLoaders.get(name).once(async () => {
        const { MemFileSystem } = await import("./node/mem-filesystem.js");
        return new MemFileSystem();
      });
      break;
    // case 'deno': {
    //   const { DenoFileSystem } = await import("./deno-filesystem.js");
    //   fs = new DenoFileSystem();
    //   break;
    // }
    default:
      fs = await externalLoaders.get(name).once(async () => {
        const { NodeFileSystem } = await import("./node/node-filesystem.js");
        return new NodeFileSystem();
      });
  }
  return fs.start();
}

import { KeyedResolvOnce, URI } from "@adviser/cement";
import { getStore } from "../../../utils.js";
import { SuperThis, SysFileSystem } from "../../../types.js";

const externalLoaders = new KeyedResolvOnce<SysFileSystem>();
export async function getFileSystem(url: URI): Promise<SysFileSystem> {
  const name = url.getParam("fs", "node");
  let fs: SysFileSystem;
  switch (name) {
    case "mem":
      fs = await externalLoaders.get(name).once(async () => {
        // const memjs = "./node/mem-filesystem.js"
        // const { MemFileSystem } = await import(/* @vite-ignore */memjs);
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
        // const nodejs = "./node/node-filesystem.js"
        // const { NodeFileSystem } = await import(/* @vite-ignore */nodejs);
        const { NodeFileSystem } = await import("./node/node-filesystem.js");
        return new NodeFileSystem();
      });
  }
  return fs.start();
}

export function getPath(url: URI, sthis: SuperThis): string {
  const basePath = url.pathname;
  // .toString()
  // .replace(new RegExp(`^${url.protocol}//`), "")
  // .replace(/\?.*$/, "");
  const name = url.getParam("name");
  if (name) {
    const version = url.getParam("version");
    if (!version) throw sthis.logger.Error().Url(url).Msg(`version not found`).AsError();
    return sthis.pathOps.join(basePath, version, name);
  }
  return sthis.pathOps.join(basePath);
}

export function getFileName(url: URI, sthis: SuperThis): string {
  const key = url.getParam("key");
  if (!key) throw sthis.logger.Error().Url(url).Msg(`key not found`).AsError();
  const res = getStore(url, sthis, (...a: string[]) => a.join("-"));
  switch (res.store) {
    case "data":
      return sthis.pathOps.join(res.name, key + ".car");
    case "wal":
    case "meta":
      return sthis.pathOps.join(res.name, key + ".json");
    default:
      throw sthis.logger.Error().Url(url).Msg(`unsupported store type`).AsError();
  }
}

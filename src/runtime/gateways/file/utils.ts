import { KeyedResolvOnce, URI } from "@adviser/cement";
import { getStore } from "../../../utils.js";
import { PARAM, SuperThis, SysFileSystem } from "../../../types.js";

const externalLoaders = new KeyedResolvOnce<SysFileSystem>();
export async function getFileSystem(url: URI): Promise<SysFileSystem> {
  const name = url.getParam("fs", "node");
  let fs: SysFileSystem;

  if (runtimeFn().isDeno) {
    const { DenoFileSystem } = await import("./deno-filesystem.js");
    fs = new DenoFileSystem();
  } else if (runtimeFn().isNodeIsh) {
    const { NodeFileSystem } = await import("./node-filesystem.js");
    fs = new NodeFileSystem();
  } else {
    throw new Error("unsupported runtime");

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
    case "node": {
      const { NodeFileSystem } = await import("./node-filesystem@skip-iife.js");
      fs = new NodeFileSystem();
      break;
    }
    case "sys":
    default: {
      // if (runtimeFn().isDeno) {
      //   return getFileSystem(url.build().setParam("fs", "deno").URI());
      // } else  {
      return getFileSystem(url.build().setParam("fs", "node").URI());
      // }
    }
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
  const name = url.getParam(PARAM.NAME);
  if (name) {
    // const version = url.getParam(PARAM.VERSION);
    // if (!version) throw sthis.logger.Error().Url(url).Msg(`version not found`).AsError();
    // if (!url.hasParam(PARAM.URL_GEN) || url.getParam(PARAM.URL_GEN) === "default") {
    return sthis.pathOps.join(basePath, name);
    // }
    // return sthis.pathOps.join(basePath, version, name);
  }
  return sthis.pathOps.join(basePath);
}

export function getFileName(url: URI, sthis: SuperThis): string {
  const key = url.getParam(PARAM.KEY);
  if (!key) throw sthis.logger.Error().Url(url).Msg(`key not found`).AsError();
  const res = getStore(url, sthis, (...a: string[]) => a.join("-"));
  switch (res.store) {
    case "data": {
      // if (!url.hasParam(PARAM.SUFFIX)) {
      //   throw sthis.logger.Error().Url(url).Msg(`unsupported suffix`).AsError();
      // }
      return sthis.pathOps.join(res.name, key + (url.getParam(PARAM.SUFFIX) || ""));
    }
    case "wal":
    case "meta":
      return sthis.pathOps.join(res.name, key + ".json");
    default:
      throw sthis.logger.Error().Url(url).Msg(`unsupported store type`).AsError();
  }
}

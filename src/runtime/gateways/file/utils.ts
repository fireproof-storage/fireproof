import { runtimeFn, URI } from "@adviser/cement";
import { getStore } from "../../../utils.js";
import { PARAM, SuperThis, SysFileSystem } from "../../../types.js";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function getFileSystem(url: URI): Promise<SysFileSystem> {
  // const name = url.getParam(PARAM.FS);
  // let fs: SysFileSystem;
  // switch (name) {
  // case "mem":
  //   {
  //     const { MemFileSystem } = await import("./mem-filesystem.js");
  //     fs = new MemFileSystem();
  //   }
  //   break;
  // case "node":
  // case "sys":
  // default: {
  let fs: SysFileSystem;
  if (runtimeFn().isDeno) {
    const { DenoFileSystem } = await import("./deno-filesystem.js");
    fs = new DenoFileSystem();
  } else if (runtimeFn().isNodeIsh) {
    const { NodeFileSystem } = await import("./node-filesystem.js");
    fs = new NodeFileSystem();
  } else {
    throw new Error("unsupported runtime");
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

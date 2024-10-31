import { URI } from "@adviser/cement";
import { getStore } from "../../../utils.js";
import { SuperThis, SysFileSystem } from "../../../types.js";

export async function getFileSystem(url: URI): Promise<SysFileSystem> {
  const name = url.getParam("fs");
  let fs: SysFileSystem;
  switch (name) {
    case "mem":
      {
        const { MemFileSystem } = await import("./mem-filesystem@skip-iife.js");
        fs = new MemFileSystem();
      }
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

export function toArrayBuffer(buffer: Buffer | string): Uint8Array {
  if (typeof buffer === "string") {
    buffer = Buffer.from(buffer);
  }
  const ab = new ArrayBuffer(buffer.length);
  const view = new Uint8Array(ab);
  for (let i = 0; i < buffer.length; ++i) {
    view[i] = buffer[i];
  }
  return view;
}

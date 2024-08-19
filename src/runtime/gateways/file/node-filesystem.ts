import type { PathLike, MakeDirectoryOptions, Stats } from "fs";
import * as fs from "fs";
import { toArrayBuffer } from "./utils.js";
import { SysFileSystem } from "../../../types.js";

export class NodeFileSystem implements SysFileSystem {
  async start(): Promise<SysFileSystem> {
    return this
  }
  mkdir(path: PathLike, options?: { recursive: boolean }): Promise<string | undefined> {
    return fs.promises.mkdir(path, options);
  }
  readdir(path: PathLike, options?: fs.ObjectEncodingOptions): Promise<string[]> {
    return fs.promises.readdir(path, options) as Promise<string[]>;
  }
  rm(path: PathLike, options?: MakeDirectoryOptions & { recursive: boolean }): Promise<void> {
    return fs.promises.rm(path, options);
  }
  copyFile(source: PathLike, destination: PathLike): Promise<void> {
    return fs.promises.copyFile(source, destination);
  }
  async readfile(path: PathLike, options?: { encoding: BufferEncoding; flag?: string }): Promise<Uint8Array> {
    const ret = await fs.promises.readFile(path, options);
    return toArrayBuffer(ret);
  }
  stat(path: PathLike): Promise<Stats> {
    return fs.promises.stat(path) as Promise<Stats>;
  }
  unlink(path: PathLike): Promise<void> {
    return fs.promises.unlink(path);
  }
  writefile(path: PathLike, data: Uint8Array | string): Promise<void> {
    return fs.promises.writeFile(path, Buffer.from(data));
  }
}




// import { type NodeMap, join } from "../../sys-container.js";
// import type { ObjectEncodingOptions, PathLike } from "fs";
// import * as fs from "fs/promises";
// import * as path from "path";
// import * as os from "os";
// import * as url from "url";
// import { toArrayBuffer } from "./utils.js";

// export async function createNodeSysContainer(): Promise<NodeMap> {
//   // const nodePath = "node:path";
//   // const nodeOS = "node:os";
//   // const nodeURL = "node:url";
//   // const nodeFS = "node:fs";
//   // const fs = (await import("node:fs")).promises;
//   // const assert = "assert";
//   // const path = await import("node:path");
//   return {
//     state: "node",
//     ...path,
//     // ...(await import("node:os")),
//     // ...(await import("node:url")),
//     ...os,
//     ...url,
//     ...fs,
//     join,
//     stat: fs.stat as NodeMap["stat"],
//     readdir: fs.readdir as NodeMap["readdir"],
//     readfile: async (path: PathLike, options?: ObjectEncodingOptions): Promise<Uint8Array> => {
//       const rs = await fs.readFile(path, options);
//       return toArrayBuffer(rs);
//     },
//     writefile: fs.writeFile as NodeMap["writefile"],
//   };
// }

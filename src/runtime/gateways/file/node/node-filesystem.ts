import type { PathLike, MakeDirectoryOptions, Stats, ObjectEncodingOptions } from "node:fs";
import type { mkdir, readdir, rm, copyFile, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { toArrayBuffer } from "./to-array-buffer.js";
import type { SysFileSystem } from "@fireproof/core";
import { runtimeFn } from "@adviser/cement";

export class NodeFileSystem implements SysFileSystem {
  fs?: {
    mkdir: typeof mkdir;
    readdir: typeof readdir;
    rm: typeof rm;
    copyFile: typeof copyFile;
    readFile: typeof readFile;
    stat: typeof stat;
    unlink: typeof unlink;
    writeFile: typeof writeFile;
  };

  async start(): Promise<SysFileSystem> {
    this.fs = await import("node:fs/promises");
    return this;
  }
  async mkdir(path: PathLike, options?: { recursive: boolean }): Promise<string | undefined> {
    return this.fs?.mkdir(path, options);
  }
  async readdir(path: PathLike, options?: ObjectEncodingOptions): Promise<string[]> {
    return this.fs?.readdir(path, options) as Promise<string[]>;
  }
  async rm(path: PathLike, options?: MakeDirectoryOptions & { recursive: boolean }): Promise<void> {
    return this.fs?.rm(path, options);
  }
  async copyFile(source: PathLike, destination: PathLike): Promise<void> {
    return this.fs?.copyFile(source, destination);
  }
  async readfile(path: PathLike, options?: { encoding: BufferEncoding; flag?: string }): Promise<Uint8Array> {
    const ret = (await this.fs?.readFile(path, options)) as Buffer;
    return toArrayBuffer(ret);
  }
  stat(path: PathLike): Promise<Stats> {
    return this.fs?.stat(path) as Promise<Stats>;
  }
  async unlink(path: PathLike): Promise<void> {
    return this.fs?.unlink(path);
  }
  async writefile(path: PathLike, data: Uint8Array | string): Promise<void> {
    if (runtimeFn().isDeno) {
      return this.fs?.writeFile(path, data);
    }
    return this.fs?.writeFile(path, Buffer.from(data));
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

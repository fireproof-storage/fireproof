import type { PathLike, MakeDirectoryOptions, Stats } from "fs";
import { SysFileSystem } from "../../sys-container.js";

import { fs } from "memfs";
import { IReaddirOptions } from "memfs/lib/node/types/options.js";
import { toArrayBuffer } from "./utils.js";

export class MemFileSystem implements SysFileSystem {
  async start(): Promise<void> {
    /* do nothing */
  }
  mkdir(path: PathLike, options?: { recursive: boolean }): Promise<string | undefined> {
    return fs.promises.mkdir(path, options);
  }
  readdir(path: PathLike, options?: IReaddirOptions): Promise<string[]> {
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

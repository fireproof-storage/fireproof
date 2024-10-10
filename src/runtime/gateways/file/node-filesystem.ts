import type { PathLike, MakeDirectoryOptions, ObjectEncodingOptions } from "fs";
import type { mkdir, readdir, rm, copyFile, readFile, stat, unlink, writeFile } from "fs/promises";
import { toArrayBuffer } from "./utils.js";
import { FPStats, SysFileSystem } from "../../../types.js";

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
    this.fs = await import("fs/promises");
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
  stat(path: PathLike): Promise<FPStats> {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.fs!.stat(path);
  }
  async unlink(path: PathLike): Promise<void> {
    return this.fs?.unlink(path);
  }
  async writefile(path: PathLike, data: Uint8Array | string): Promise<void> {
    return this.fs?.writeFile(path, Buffer.from(data));
  }
}

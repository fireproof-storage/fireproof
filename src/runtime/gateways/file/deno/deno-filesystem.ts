import type { FPStats, SysFileSystem } from "@fireproof/core";

export class DenoFileSystem implements SysFileSystem {
  fs?: {
    mkdir: typeof Deno.mkdir;
    readDir: typeof Deno.readDir;
    rm: typeof Deno.remove;
    copyFile: typeof Deno.copyFile;
    readFile: typeof Deno.readFile;
    stat: typeof Deno.stat;
    remove: typeof Deno.remove;
    writeFile: typeof Deno.writeFile;
  };

  async start(): Promise<SysFileSystem> {
    this.fs = Deno as unknown as DenoFileSystem["fs"];
    return this;
  }
  async mkdir(path: string, options?: { recursive: boolean }): Promise<string | undefined> {
    return this.fs?.mkdir(path, options).then(() => path);
  }
  async readdir(path: string): Promise<string[]> {
    const ret = [];
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    for await (const dirEntry of this.fs!.readDir(path)) {
      ret.push(dirEntry.name);
    }
    return ret;
  }
  async rm(path: string, options?: { recursive: boolean }): Promise<void> {
    return this.fs?.rm(path, options);
  }
  async copyFile(source: string, destination: string): Promise<void> {
    return this.fs?.copyFile(source, destination);
  }
  async readfile(path: string): Promise<Uint8Array> {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.fs!.readFile(path);
  }
  async stat(path: string): Promise<FPStats> {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const x = await this.fs!.stat(path);
    return {
      isFile: () => x.isFile,
      isDirectory: () => x.isDirectory,
      isBlockDevice: () => !!x.isBlockDevice,
      isCharacterDevice: () => !!x.isCharDevice,
      isSymbolicLink: () => !!x.isSymlink,
      isFIFO: () => !!x.isFifo,
      isSocket: () => !!x.isSocket,
      uid: x.uid,
      gid: x.gid,
      size: x.size,
      atime: x.atime,
      mtime: x.mtime,
      ctime: x.birthtime,
      birthtime: x.birthtime,
    };
  }
  async unlink(path: string): Promise<void> {
    return this.fs?.remove(path);
  }
  async writefile(path: string, data: Uint8Array | string): Promise<void> {
    return this.fs?.writeFile(path, Buffer.from(data));
  }
}

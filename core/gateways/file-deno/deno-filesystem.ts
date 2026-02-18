/// <reference types="deno" />
import type { FPStats, SysFileSystem } from "@fireproof/core-types-base";
import { Lazy, to_uint8 } from "@adviser/cement";

export class DenoFileSystem implements SysFileSystem {
  readonly fs = Lazy(() => {
    return Deno; // as unknown as DenoFileSystem["fs"];
  });

  async start(): Promise<SysFileSystem> {
    return this;
  }
  async mkdir(path: string, options?: { recursive: boolean }): Promise<string | undefined> {
    return this.fs()
      .mkdir(path, options)
      .then(() => path);
  }
  async readdir(path: string): Promise<string[]> {
    const ret = [];
    for await (const dirEntry of this.fs().readDir(path)) {
      ret.push(dirEntry.name);
    }
    return ret;
  }
  async rm(path: string, options?: { recursive: boolean }): Promise<void> {
    return this.fs().remove(path, options);
  }
  async copyFile(source: string, destination: string): Promise<void> {
    return this.fs().copyFile(source, destination);
  }
  async readfile(path: string): Promise<Uint8Array> {
    const ret = await this.fs().readFile(path);
    //2.6.7debug console.log("DenoFileSystem-readfile", path, typeof ret, ret instanceof Uint8Array ? ret.length : ret, await sha256(ret));
    return ret;
  }
  async stat(path: string): Promise<FPStats> {
    const x = await this.fs().stat(path);
    return {
      isFile: () => x.isFile,
      isDirectory: () => x.isDirectory,
      isBlockDevice: () => !!x.isBlockDevice,
      isCharacterDevice: () => !!x.isCharDevice,
      isSymbolicLink: () => x.isSymlink,
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
    return this.fs().remove(path);
  }
  async writefile(path: string, data: Uint8Array | string): Promise<void> {
    const toUint8 = to_uint8(data);
    //2.6.7debug console.log("DenoFileSystem-writefile", path, typeof data, data.length, equals(toUint8, data as Uint8Array), await sha256(toUint8), data instanceof Uint8Array ? await sha256(data) : "not Uint8Array");
    return this.fs().writeFile(path, toUint8);
  }
}

/*2.6.7debug helpers
const equals = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((val, i) => val === b[i]);

async function sha256(data: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer); 
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}
*/

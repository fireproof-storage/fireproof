import type { Dirent, MakeDirectoryOptions, ObjectEncodingOptions, PathLike } from "node:fs";

import * as stdEnv from "std-env";
import { throwFalsy } from "../types.js";
import { uuidv4 } from "uuidv7";

export interface NodeMap {
  state: "seeded" | "browser" | "node";
  join: (...args: string[]) => string;
  dirname: (path: string) => string;
  homedir: () => string;
  fileURLToPath: (url: string | URL) => string;
  assert: (condition: unknown, message?: string | Error) => void;

  mkdir: (path: PathLike, options?: { recursive: boolean }) => Promise<string | undefined>;
  readdir: (path: PathLike, options?: unknown) => Promise<unknown[]>;

  rm: (path: PathLike, options?: MakeDirectoryOptions & { recursive: boolean }) => Promise<void>;
  copyFile: (source: PathLike, destination: PathLike) => Promise<void>;

  readfile: (path: PathLike, options?: { encoding: BufferEncoding; flag?: string }) => Promise<string>;

  unlink: (path: PathLike) => Promise<void>;
  writefile: (path: PathLike, data: Uint8Array | string) => Promise<void>;
}

export function assert(condition: unknown, message?: string | Error): asserts condition {
  SysContainer.freight?.assert(condition, message);
}

class sysContainer {
  freight: NodeMap = {
    state: "seeded",
    join: (...paths: string[]) => paths.join("/").replace(/\/\/+/g, "/"),
    dirname: (path: string) => path.split("/").slice(0, -1).join("/"),
    homedir: () => "/browser",
    fileURLToPath: (strurl: string | URL) => {
      let url: URL;
      if (typeof strurl === "string") {
        url = new URL(strurl);
      } else {
        url = strurl;
      }
      return url.pathname;
    },
    assert: (condition: unknown, message?: string | Error) => {
      if (!condition) {
        if (message instanceof Error) {
          throw message;
        } else {
          throw new Error(message);
        }
      }
    },
    mkdir: () => Promise.resolve(""),
    readdir: () => Promise.resolve([]),
    rm: () => Promise.resolve(),
    copyFile: () => Promise.resolve(),
    readfile: () => Promise.resolve(""),
    unlink: () => Promise.resolve(),
    writefile: () => Promise.resolve(),
  };

  readonly id = uuidv4();

  async start(): Promise<void> {
    switch (this.freight.state) {
      case "seeded":
        if (stdEnv.isNode) {
          const { createNodeSysContainer } = await import("./node-sys-container.js");
          this.freight = await createNodeSysContainer();
        } else {
          this.freight.state = "browser";
        }
        return;
      case "browser":
      case "node":
        return;
    }
  }

  async readdir(
    path: PathLike,
    options?:
      | (ObjectEncodingOptions & { withFileTypes?: false | undefined; recursive?: boolean })
      | BufferEncoding
      | null
      | undefined,
  ) {
    this.logSeeded("readdir");
    return (throwFalsy(this.freight).readdir(path, options) as Promise<string[]>) || [];
  }
  async readdirent(
    path: PathLike,
    options: (ObjectEncodingOptions & { withFileTypes: true; recursive?: boolean }) | BufferEncoding | null | undefined,
  ): Promise<Dirent[]> {
    this.logSeeded("readdirent");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (throwFalsy(this.freight).readdir(path, { ...(options as any), withFileTypes: true }) as Promise<Dirent[]>) || [];
  }

  async readfile(path: PathLike, options?: { encoding: BufferEncoding; flag?: string }) {
    this.logSeeded("readfile");
    return throwFalsy(this.freight).readfile(path, options) as unknown as Promise<Buffer>;
  }

  async mkdir(path: PathLike, options: { recursive: boolean }) {
    this.logSeeded("mkdir");
    return throwFalsy(this.freight).mkdir(path, options);
  }

  async rm(path: PathLike, options: MakeDirectoryOptions & { recursive: boolean }) {
    this.logSeeded("rm");
    return throwFalsy(this.freight).rm(path, options);
  }

  async unlink(path: PathLike) {
    this.logSeeded("unlink");
    return throwFalsy(this.freight).unlink(path);
  }

  async writefile(path: PathLike, data: Uint8Array | string) {
    this.logSeeded("writefile");
    return throwFalsy(this.freight).writefile(path, data);
  }

  async copyFile(source: PathLike, destination: PathLike) {
    this.logSeeded("copyFile");
    return throwFalsy(this.freight).copyFile(source, destination);
  }

  fileURLToPath(url: string | URL) {
    this.logSeeded("fileURLToPath");
    return throwFalsy(this.freight).fileURLToPath(url);
  }

  dirname(path: string) {
    this.logSeeded("dirname");
    return throwFalsy(this.freight).dirname(path);
  }

  join(...args: string[]): string {
    this.logSeeded("join");
    return throwFalsy(this.freight).join(...args);
  }

  homedir = () => {
    this.logSeeded("homedir");
    return throwFalsy(this.freight).homedir();
  };

  logSeeded(method: string) {
    if (this.freight.state === "seeded") {
      const err = new Error();
      console.warn(`SysContainer.${method} is not available in seeded state:`, err.stack);
    }
  }
}

export const SysContainer = new sysContainer();

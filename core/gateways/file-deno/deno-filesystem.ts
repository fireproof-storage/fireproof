/// <reference types="deno" />
import type { FPSql, FPSqlCmd, FPSqlConn, FPSqlResult, FPStats, SysFileSystem } from "@fireproof/core-types-base";
import { exception2Result, to_uint8 } from "@adviser/cement";
import type { DatabaseSync } from "node:sqlite";

class NodeSqlite implements FPSql {
  readonly path: string;
  readonly db: DatabaseSync;
  readonly fs: SysFileSystem;

  constructor(db: DatabaseSync, fs: SysFileSystem, path: string) {
    this.db = db;
    this.path = path;
    this.fs = fs;
  }

  async batch(sqlCmds: FPSqlCmd[]): Promise<FPSqlResult[]> {
    const ret: FPSqlResult[] = [];
    const withStmt = sqlCmds.map((cmd) => ({
      ...cmd,
      argss: cmd.argss ?? [[]],
      stmt: this.db.prepare(cmd.sql),
    }));
    for (const cmd of withStmt) {
      for (const args of cmd.argss) {
        const r = exception2Result(() => cmd.stmt.all(...args));
        switch (true) {
          case r.isOk():
            ret.push({ rows: r.Ok().map((i) => Object.values(i)) });
            break;
          case r.isErr():
            ret.push({ error: r.Err() });
            break;
        }
      }
    }
    return Promise.resolve(ret);
  }

  async transaction<T>(fn: (tx: FPSql) => Promise<T>): Promise<T> {
    return fn(this);
  }

  close(): Promise<void> {
    this.db.close();
    return Promise.resolve();
  }
  destroy(): Promise<void> {
    return this.fs.rm(this.path);
  }
}

class NodeSqliteConn implements FPSqlConn {
  readonly fs: SysFileSystem;
  readonly #dbs: (path: string) => DatabaseSync;

  static async create(fs: SysFileSystem): Promise<NodeSqliteConn> {
    const rNodeSql = await exception2Result(() => import("node:sqlite"));
    if (rNodeSql.isErr()) {
      throw new Error("Need node:sqlite in node 22 and deno.");
    }
    const { DatabaseSync } = rNodeSql.Ok();
    return new NodeSqliteConn(fs, (path: string) => new DatabaseSync(path));
  }
  private constructor(fs: SysFileSystem, dbs: (path: string) => DatabaseSync) {
    this.fs = fs;
    this.#dbs = dbs;
  }
  async open(path: string): Promise<FPSql> {
    return new NodeSqlite(this.#dbs(path), this.fs, path);
  }
}

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

  sqlite(): Promise<FPSqlConn> {
    return this.start().then((fs) => NodeSqliteConn.create(fs));
  }

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
    return this.fs?.remove(path);
  }
  async writefile(path: string, data: Uint8Array | string): Promise<void> {
    return this.fs?.writeFile(path, to_uint8(data));
  }
}

import type { PathLike, MakeDirectoryOptions, Stats, ObjectEncodingOptions } from "node:fs";
import type { mkdir, readdir, rm, copyFile, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { toArrayBuffer } from "./to-array-buffer.js";
import type { FPSqlCmd, FPSqlConn, FPSql, FPSqlResult, SysFileSystem } from "@fireproof/core-types-base";
import { exception2Result } from "@adviser/cement";
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

  sqlite(): Promise<FPSqlConn> {
    return this.start().then((fs) => NodeSqliteConn.create(fs));
  }

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
    return this.fs?.writeFile(path, data);
  }
}

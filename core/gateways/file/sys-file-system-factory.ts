import { CoerceURI, KeyedResolvOnce, Lazy, Result, runtimeFn, URI } from "@adviser/cement";
import {
  isFPSqlResultError,
  isFPSqlResultOk,
  type FPSql,
  type FPSQLInputValue,
  type SuperThis,
  type SysFileSystem,
} from "@fireproof/core-types-base";
import { BlockLog, Cars, CidSet, DBTable, FPIndexedDB, KV, Peers } from "@fireproof/core-types-blockstore";

export function sysFileSystemFactory(uri: URI): Promise<SysFileSystem> {
  const rt = runtimeFn();
  switch (true) {
    case rt.isNodeIsh:
      return import("@fireproof/core-gateways-file-node").then((m) => m.getSysFileSystem(uri));
    case rt.isDeno:
      return import("@fireproof/core-gateways-file-deno").then((m) => m.getSysFileSystem(uri));
    default:
      throw new Error(`unsupported runtime:${rt}`);
  }
}

const dbs = new KeyedResolvOnce<FPSQLTable<unknown>>();
class FPSQLTable<T> implements DBTable<T> {
  readonly #url: string;
  readonly #type: string;
  constructor(url: CoerceURI, type: string) {
    this.#type = type;
    this.#url = URI.from(url).toString();
  }
  db(): Promise<FPSql> {
    return dbs.get(this.#url).once(async () => {
      const uri = URI.from(this.#url);
      const fp = await sysFileSystemFactory(uri)
        .then((fs) => fs.sqlite())
        .then((db) => db.open(uri.pathname));
      await fp.batch([
        {
          sql: `
      CREATE TABLE IF NOT EXISTS KV (
        key TEXT NOT NULL,
        type TEXT NOT NULL,
        val JSON,
        PRIMARY KEY (key, type)
      )`,
        },
      ]);
      return fp;
    });
  }

  async add(...t: KV<T, string>[]): Promise<Result<KV<T, string>[]>> {
    const batch = t.map((i) => ({
      sql: "INSERT INTO KV (key, type, val) VALUES (?, ?, ?)",
      argss: [[i.key, this.#type, JSON.stringify(i.value)]],
    }));
    return this.db()
      .then((db) => db.batch(batch))
      .then(() => Result.Ok(t))
      .catch((e) => Result.Err(e));
  }
  delete(key: string): Promise<Result<void>> {
    return this.db()
      .then((db) =>
        db.batch([
          {
            sql: "DELETE FROM KV WHERE key = ? AND type = ?",
            argss: [[key, this.#type]],
          },
        ]),
      )
      .then(() => Result.Ok())
      .catch((e) => Result.Err(e));
  }
  get(key: string): Promise<Result<T | undefined>> {
    return this.db()
      .then((db) =>
        db.batch([
          {
            sql: "SELECT val FROM KV WHERE key = ? AND type = ?",
            argss: [[key, this.#type]],
          },
        ]),
      )
      .then((r) => {
        switch (true) {
          case isFPSqlResultError(r[0]):
            return Result.Err(r[0].error);
          case isFPSqlResultOk(r[0]): {
            if (r[0].rows.length === 0) {
              return Result.Ok(undefined);
            }
            const row = r[0].rows[0];
            return Result.Ok(JSON.parse(row[0] as string) as T);
          }
          default:
            return Result.Err(new Error("unknown result"));
        }
      });
    // return this.db().then(db => db.execute("SELECT val FROM KV WHERE key = ? AND type = ?", [key, this.#type]))
    // .then(r => r.rows[0]?.val ? JSON.parse(r.rows[0]?.val as string) : undefined);
  }
  put(...t: KV<T, string>[]): Promise<Result<KV<T, string>[]>> {
    const batch = t.map((i) => ({
      sql: "INSERT OR REPLACE INTO KV (key, type, val) VALUES (?, ?, ?)",
      argss: [[i.key, this.#type, JSON.stringify(i.value)]],
    }));
    return this.db()
      .then((db) => db.batch(batch))
      .then(() => Result.Ok(t))
      .catch((e) => Result.Err(e));
  }
  list(start?: string, end?: string): ReadableStream<T> {
    return new ReadableStream({
      start: (controller) => {
        this.db()
          .then((db) => {
            let sqlStmt: { sql: string; argss: FPSQLInputValue[][] };
            switch (true) {
              case typeof start === "string" && end === "string":
                sqlStmt = { sql: "SELECT val FROM KV WHERE type = ? AND key >= ? AND key <= ?", argss: [[this.#type, start, end]] };
                break;
              case typeof start === "string":
                sqlStmt = { sql: "SELECT val FROM KV WHERE type = ? AND key >= ?", argss: [[this.#type, start]] };
                break;
              case typeof end === "string":
                sqlStmt = { sql: "SELECT val FROM KV WHERE type = ? AND key <= ?", argss: [[this.#type, end]] };
                break;
              default:
                sqlStmt = { sql: "SELECT val FROM KV WHERE type = ?", argss: [[this.#type]] };
            }
            return db.batch([sqlStmt]);
          })
          .then((res) => {
            for (const r of res) {
              if (isFPSqlResultError(r)) {
                controller.error(r.error);
              }
              if (isFPSqlResultOk(r)) {
                for (const row of r.rows) {
                  controller.enqueue(JSON.parse(row[0] as string) as T);
                }
              }
            }
            controller.close();
          })
          .catch((e) => {
            controller.error(e);
          });
      },
    });
  }
  async transaction<R>(fn: (tx: Omit<DBTable<T, string>, "transaction">) => Promise<R>): Promise<R> {
    const tx = await this.db();
    return tx.transaction((db) => fn(new FPSQLTableTX(this.#url, this.#type, db))); //.then((r) => tx.commit().then(() => r)).catch((e) => tx.rollback().then(() => { throw e; }));
    //  fn(new FPSQLTableTX(this.#url, this.#type, tx)).then((r) => tx.commit().then(() => r)).catch((e) => tx.rollback().then(() => { throw e; }));
  }

  clear(): Promise<void> {
    return this.db()
      .then((db) =>
        db.batch([
          {
            sql: "DELETE FROM KV WHERE type = ?",
            argss: [[this.#type]],
          },
        ]),
      )
      .then(() => {
        /* empty */
      });
    // return this.db().then(db => db.execute("DELETE FROM KV WHERE type = ?", [this.#type])).then(() => { /* empty */ });
  }
}

class FPSQLTableTX<T> extends FPSQLTable<T> {
  readonly #tx: Omit<FPSql, "transaction">;
  constructor(url: string, type: string, tx: Omit<FPSql, "transaction">) {
    super(url, type);
    this.#tx = tx;
  }
  db(): Promise<FPSql> {
    return Promise.resolve(this.#tx as unknown as FPSql);
  }
}

export class FPFileDBImpl implements FPIndexedDB {
  readonly #name: string;
  constructor(name: string) {
    this.#name = name;
  }
  close(): Promise<void> {
    return (this.fpSync.blockLogs() as FPSQLTable<BlockLog>).db().then((db) => db.close());
  }
  destroy(): Promise<void> {
    const url = URI.from(this.#name);
    return sysFileSystemFactory(url).then((fs) => fs.rm(url.pathname));
  }
  objectStore<T = Uint8Array>(_name: string): DBTable<T> {
    throw new Error("Method not implemented.");
  }

  readonly fpSync = {
    blockLogs: Lazy((): DBTable<BlockLog> => new FPSQLTable(this.#name, "blockLogs")),
    cidSets: Lazy((): DBTable<CidSet> => new FPSQLTable(this.#name, "cidSets")),
    cars: Lazy((): DBTable<Cars> => new FPSQLTable(this.#name, "cars")),
    peers: Lazy((): DBTable<Peers> => new FPSQLTable(this.#name, "peers")),
  };
  version(): DBTable<{ version: string }> {
    throw new Error("Method not implemented.");
  }
}

const keyedDB = new KeyedResolvOnce<FPIndexedDB>();

export function sysFileFPIndexedDB(sthis: SuperThis, uri: URI): Promise<FPIndexedDB> {
  return keyedDB.get(uri.toString()).once(async () => new FPFileDBImpl(uri.toString()));
}

import type { RunResult, Statement } from "node-sqlite3-wasm";
import { DBConnection, MetaRecord, MetaRecordKey, MetaSQLStore } from "../../types.js";
import { V0_19NSWConnection} from "./sqlite-connection.js";
import { KeyedResolvOnce, Logger, Result } from "@adviser/cement";
import { UploadMetaFnParams } from "../../../../blockstore/types.js";
import { ensureNSWVersion } from "./sqlite-ensure-version.js";
import { ensureLogger, exception2Result, getStore } from "../../../../utils.js";

export class MetaSQLRecordBuilder {
  readonly record: MetaRecord;
  readonly textEncoder: TextEncoder;

  constructor(record: MetaRecord, textEncoder: TextEncoder) {
    this.record = record;
    this.textEncoder = textEncoder;
  }

  static fromUploadMetaFnParams(data: Uint8Array, params: UploadMetaFnParams, textEncoder: TextEncoder): MetaSQLRecordBuilder {
    return new MetaSQLRecordBuilder(
      {
        name: params.name,
        branch: params.branch,
        meta: data,
        updated_at: new Date(),
      },
      textEncoder,
    );
  }

  static fromBytes(str: string, name: string, branch: string, textEncoder: TextEncoder): MetaSQLRecordBuilder {
    return new MetaSQLRecordBuilder(
      {
        name: name,
        branch: branch,
        meta: textEncoder.encode(str),
        updated_at: new Date(),
      },
      textEncoder,
    );
  }

  build(): MetaRecord {
    return this.record;
  }
}

// interface SQLiteMetaRecord {
//   name: string;
//   branch: string;
//   meta: Buffer;
//   updated_at: string;
// }

export class V0_19NSWMetaStore implements MetaSQLStore {
  readonly dbConn: V0_19NSWConnection;
  readonly logger: Logger;
  constructor(dbConn: DBConnection) {
    this.dbConn = dbConn as V0_19NSWConnection;
    this.logger = ensureLogger(dbConn.opts, "V0_19NSWMetaStore");
    this.logger.Debug().Msg("constructor");
  }
  async start(url: URL): Promise<void> {
    this.logger.Debug().Url(url).Msg("starting");
    await this.dbConn.connect();
    await ensureNSWVersion(url, this.dbConn);
    this.logger.Debug().Url(url).Msg("started");
  }

  table(url: URL): string {
    return getStore(url, this.logger, (...x: string[]) => x.join("_"));
  }

  readonly #createTable = new KeyedResolvOnce();
  async createTable(url: URL) {
    return this.#createTable.get(this.table(url)).once(async (table) => {
      await this.dbConn.client
        .prepare(
          `CREATE TABLE IF NOT EXISTS ${table} (
            name TEXT not null,
            branch TEXT not null,
            meta BLOB NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (name, branch)
            )`,
        )
        .run();
    });
  }

  readonly #insertStmt = new KeyedResolvOnce<Statement>();
  private async insertStmt(url: URL) {
    return this.#insertStmt.get(this.table(url)).once(async (table) => {
      await this.createTable(url);
      return this.dbConn.client.prepare(`insert into ${table}
          (name, branch, meta, updated_at)
          values (:name, :branch, :meta, :updated_at)
          ON CONFLICT(name, branch) DO UPDATE SET meta=:meta, updated_at=:updated_at
          `);
    });
  }

  readonly #selectStmt = new KeyedResolvOnce<Statement>();
  private async selectStmt(url: URL) {
    return this.#selectStmt.get(this.table(url)).once(async (table) => {
      await this.createTable(url);
      return this.dbConn.client.prepare(`select name, branch, meta, updated_at from ${table} where name = :name and branch = :branch`);
    });
  }

  readonly #deleteStmt = new KeyedResolvOnce<Statement>();
  private async deleteStmt(url: URL) {
    return this.#deleteStmt.get(this.table(url)).once(async (table) => {
      await this.createTable(url);
      return this.dbConn.client.prepare(`delete from ${table} where name = :name and branch = :branch`);
    });
  }

  async insert(url: URL, ose: MetaRecord): Promise<RunResult> {
    this.logger.Debug().Str("name", ose.name).Str("branch", ose.branch).Uint64("data-len", ose.meta.length).Msg("insert");
    // const bufMeta = Buffer.from(ose.meta);
    return this.insertStmt(url).then((i) =>
      i.run({
        ':name': ose.name,
        ':branch': ose.branch,
        ':meta': ose.meta,
        ':updated_at': ose.updated_at.toISOString()
      })//, bufMeta, ose.updated_at.toISOString()),
    );
  }
  async select(url: URL, key: MetaRecordKey): Promise<MetaRecord[]> {
    this.logger.Debug().Str("name", key.name).Str("branch", key.branch).Msg("select");
    return (await this.selectStmt(url).then((i) => i.all({
      ':name': key.name,
      ':branch': key.branch
    }))).map((irow) => {
      const row = irow // as SQLiteMetaRecord;
      return {
        name: row.name?.valueOf() as string,
        branch: row.branch?.valueOf() as string,
        meta: Uint8Array.from(row.meta?.valueOf() as Buffer),
        updated_at: new Date(row.updated_at?.valueOf() as string),
      };
    });
  }

  async delete(url: URL, key: MetaRecordKey): Promise<RunResult> {
    this.logger.Debug().Str("name", key.name).Str("branch", key.branch).Msg("delete");
    return this.deleteStmt(url).then((i) => i.run({
      ':name': key.name,
      ':branch': key.branch
  }));
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async close(url: URL): Promise<Result<void>> {
    this.logger.Debug().Msg("close");
    // await this.dbConn.close();
    return Result.Ok(undefined);
  }
  async destroy(url: URL): Promise<Result<void>> {
    return exception2Result(async () => {
      this.logger.Debug().Msg("destroy");
      await this.dbConn.client.prepare(`delete from ${this.table(url)}`).run();
    });
  }
}

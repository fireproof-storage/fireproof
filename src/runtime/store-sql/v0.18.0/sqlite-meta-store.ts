import type { RunResult, Statement } from "better-sqlite3";
import { DBConnection, MetaRecord, MetaRecordKey, MetaSQLStore } from "../types.js";
import { SQLiteConnection } from "../sqlite-adapter-better-sqlite3.js";
import { Logger } from "@adviser/cement";
import { ensureLogger } from "../ensurer.js";
import { UploadMetaFnParams } from "../../../block-store/types.js";

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

interface SQLiteMetaRecord {
  name: string;
  branch: string;
  meta: Buffer;
  updated_at: string;
}

export class V0_18_0SQLiteMetaStore implements MetaSQLStore {
  _insertStmt?: Statement;
  _selectStmt?: Statement;
  _deleteStmt?: Statement;
  readonly dbConn: SQLiteConnection;
  readonly table: string;
  readonly logger: Logger;
  constructor(dbConn: DBConnection) {
    this.dbConn = dbConn as SQLiteConnection;
    this.table = dbConn.opts.tableNames.meta;
    this.logger = ensureLogger(dbConn.opts, "SQLiteMetaStore").With().Str("table", this.table).Logger();
    this.logger.Debug().Msg("constructor");
  }
  async start(): Promise<void> {
    this.logger.Debug().Msg("start");
    await this.dbConn.connect();
    await this.dbConn.client
      .prepare(
        `CREATE TABLE IF NOT EXISTS ${this.table} (
        name TEXT not null,
        branch TEXT not null,
        meta BLOB NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (name, branch)
        )`,
      )
      .run();
    this._insertStmt = this.dbConn.client.prepare(`insert into ${this.table}
          (name, branch, meta, updated_at)
          values (?, ?, ?, ?)
          ON CONFLICT(name, branch) DO UPDATE SET meta=?, updated_at=?
          `);
    this._selectStmt = this.dbConn.client.prepare(
      `select name, branch, meta, updated_at from ${this.table} where name = ? and branch = ?`,
    );
    this._deleteStmt = this.dbConn.client.prepare(`delete from ${this.table} where name = ? and branch = ?`);
  }

  get insertStmt(): Statement {
    if (!this._insertStmt) {
      throw this.logger.Error().Msg("insert statement not prepared").AsError();
    }
    return this._insertStmt;
  }

  get selectStmt(): Statement {
    if (!this._selectStmt) {
      throw this.logger.Error().Msg("select statement not prepared").AsError();
    }
    return this._selectStmt;
  }

  get deleteStmt(): Statement {
    if (!this._deleteStmt) {
      throw this.logger.Error().Msg("delete statement not prepared").AsError();
    }
    return this._deleteStmt;
  }

  async insert(ose: MetaRecord): Promise<RunResult> {
    this.logger.Debug().Str("name", ose.name).Str("branch", ose.branch).Uint64("data-len", ose.meta.length).Msg("insert");
    const bufMeta = Buffer.from(ose.meta);
    return this.insertStmt.run(ose.name, ose.branch, bufMeta, ose.updated_at.toISOString(), bufMeta, ose.updated_at.toISOString());
  }
  async select(key: MetaRecordKey): Promise<MetaRecord[]> {
    this.logger.Debug().Str("name", key.name).Str("branch", key.branch).Msg("select");
    return (await this.selectStmt.all(key.name, key.branch)).map((irow) => {
      const row = irow as SQLiteMetaRecord;
      return {
        name: row.name,
        branch: row.branch,
        meta: Uint8Array.from(row.meta),
        updated_at: new Date(row.updated_at),
      };
    });
  }

  async delete(key: MetaRecordKey): Promise<RunResult> {
    this.logger.Debug().Str("name", key.name).Str("branch", key.branch).Msg("delete");
    return this.deleteStmt.run(key.name, key.branch);
  }
  async close(): Promise<void> {
    this.logger.Debug().Msg("close");
    // await this.dbConn.close();
  }
  async destroy(): Promise<void> {
    this.logger.Debug().Msg("destroy");
    await this.dbConn.client.prepare(`delete from ${this.table}`).run();
  }
}

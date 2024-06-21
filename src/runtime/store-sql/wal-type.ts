import { RunResult, Statement } from "better-sqlite3";
import { DBConnection, SQLStore } from "./types";
import { SQLOpts, SQLiteConnection, ensureLogger, ensureTableNames } from "./sqlite-adapter-node";
import { Logger } from "@adviser/cement";

export interface WalKey {
  readonly name: string;
  readonly branch: string;
}

export interface WalRecord extends WalKey {
  readonly state: Uint8Array;
  readonly updated_at: Date;
}

const tee = new TextEncoder();
export class WalSQLRecordBuilder {
  readonly #record: WalRecord;

  constructor(record: WalRecord) {
    this.#record = record;
  }

  static fromRecord(record: WalRecord): WalSQLRecordBuilder {
    return new WalSQLRecordBuilder(record);
  }

  build(): WalRecord {
    return this.#record;
  }
}

interface SQLiteWalRecord {
  readonly name: string;
  readonly branch: string;
  readonly state: Buffer;
  readonly updated_at: string;
}

export type WalSQLStore = SQLStore<WalRecord, WalKey>;

class SQLiteWalStore implements WalSQLStore {
  _insertStmt?: Statement;
  _selectStmt?: Statement;
  _deleteStmt?: Statement;
  readonly dbConn: SQLiteConnection;
  readonly table: string;
  readonly logger: Logger;
  constructor(dbConn: SQLiteConnection, opts?: Partial<SQLOpts>) {
    this.dbConn = dbConn;
    this.table = ensureTableNames(opts).wal;
    this.logger = ensureLogger(opts, "SQLiteWalStore").With().Str("table", this.table).Logger();
    this.logger.Debug().Msg("constructor");
  }
  async start(): Promise<SQLiteWalStore> {
    this.logger.Debug().Msg("start");
    await this.dbConn.connect();
    await this.dbConn.client
      .prepare(
        `CREATE TABLE IF NOT EXISTS ${this.table} (
        name TEXT not null,
        branch TEXT not null,
        state BLOB NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (name, branch)
        )`,
      )
      .run();
    this._insertStmt = this.dbConn.client.prepare(`insert into ${this.table}
          (name, branch, state, updated_at)
          values (?, ?, ?, ?)
          ON CONFLICT(name, branch) DO UPDATE SET state=?, updated_at=?
          `);
    this._selectStmt = this.dbConn.client.prepare(
      `select name, branch, state, updated_at from ${this.table} where name = ? and branch = ?`,
    );
    this._deleteStmt = this.dbConn.client.prepare(`delete from ${this.table} where name = ? and branch = ?`);
    return this;
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
  async insert(ose: WalRecord): Promise<RunResult> {
    const wal = WalSQLRecordBuilder.fromRecord(ose).build();
    const bufState = Buffer.from(tee.encode(JSON.stringify(wal.state)));
    return this.insertStmt.run(
      ose.name,
      ose.branch,
      bufState,
      wal.updated_at.toISOString(),
      bufState,
      wal.updated_at.toISOString(),
    );
  }
  async select(key: WalKey): Promise<WalRecord[]> {
    const res = (await this.selectStmt.all(key.name, key.branch)).map((irow) => {
      const row = irow as SQLiteWalRecord;
      return {
        name: row.name,
        branch: row.branch,
        state: Uint8Array.from(row.state),
        updated_at: new Date(row.updated_at),
      };
    });
    this.logger.Debug().Str("name", key.name).Str("branch", key.branch).Uint64("res", res.length).Msg("select");
    return res;
  }
  async delete(key: WalKey): Promise<RunResult> {
    this.logger.Debug().Str("name", key.name).Str("branch", key.branch).Msg("delete");
    return this.deleteStmt.run(key.name, key.branch);
  }
}

export function WalStoreFactory(db: DBConnection, opts?: Partial<SQLOpts>): WalSQLStore {
  if (db instanceof SQLiteConnection) {
    const store = new SQLiteWalStore(db, opts);
    return store;
  }
  throw ensureLogger(opts, "WalStoreFactory").Error().Msg("unsupported db connection").AsError();
}

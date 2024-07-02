import type { RunResult, Statement } from "better-sqlite3";
import { DBConnection, WalKey, WalRecord, WalSQLStore } from "../types.js";
import { SQLiteConnection } from "../sqlite-adapter-better-sqlite3.js";
import { Logger } from "@adviser/cement";
import { ensureLogger } from "../ensurer.js";

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

export class V0_18_0SQLiteWalStore implements WalSQLStore {
  _insertStmt?: Statement;
  _selectStmt?: Statement;
  _deleteStmt?: Statement;
  readonly dbConn: SQLiteConnection;
  readonly table: string;
  readonly logger: Logger;
  readonly textEncoder: TextEncoder;
  constructor(dbConn: DBConnection) {
    this.dbConn = dbConn as SQLiteConnection;
    this.table = dbConn.opts.tableNames.wal;
    this.textEncoder = dbConn.opts.textEncoder;
    this.logger = ensureLogger(dbConn.opts, "SQLiteWalStore").With().Str("table", this.table).Logger();
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
    const bufState = Buffer.from(this.textEncoder.encode(JSON.stringify(wal.state)));
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
  async close(): Promise<void> {
    this.logger.Debug().Msg("close");
    // await this.dbConn.close();
  }
  async destroy(): Promise<void> {
    this.logger.Debug().Msg("destroy");
    await this.dbConn.client.prepare(`delete from ${this.table}`).run();
  }
}

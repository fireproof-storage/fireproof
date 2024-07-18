import type { RunResult, Statement } from "better-sqlite3";
import { DBConnection, WalKey, WalRecord, WalSQLStore } from "../../types.js";
import { V0_19BS3Connection } from "./sqlite-connection.js";
import { KeyedResolvOnce, Logger, Result } from "@adviser/cement";
import { ensureBS3Version } from "./sqlite-ensure-version.js";
import { ensureLogger, exception2Result, getStore } from "../../../../utils.js";

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

export class V0_19BS3WalStore implements WalSQLStore {
  readonly dbConn: V0_19BS3Connection;
  readonly logger: Logger;
  readonly textEncoder: TextEncoder;
  constructor(dbConn: DBConnection) {
    this.dbConn = dbConn as V0_19BS3Connection;
    this.textEncoder = dbConn.opts.textEncoder;
    this.logger = ensureLogger(dbConn.opts, "V0_19BS3WalStore");
    this.logger.Debug().Msg("constructor");
  }
  async start(url: URL): Promise<void> {
    this.logger.Debug().Msg("start");
    await this.dbConn.connect();
    await ensureBS3Version(url, this.dbConn);

    // this._insertStmt =
    // this._selectStmt = this.dbConn.client.prepare(
    //   `select name, branch, state, updated_at from ${this.table} where name = ? and branch = ?`,
    // );
    // this._deleteStmt = this.dbConn.client.prepare(`delete from ${this.table} where name = ? and branch = ?`);
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
            state BLOB NOT NULL,
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
      (name, branch, state, updated_at)
      values (?, ?, ?, ?)
      ON CONFLICT(name, branch) DO UPDATE SET state=?, updated_at=?
      `);
    });
  }

  readonly #selectStmt = new KeyedResolvOnce<Statement>();
  private async selectStmt(url: URL) {
    return this.#selectStmt.get(this.table(url)).once(async (table) => {
      await this.createTable(url);
      return this.dbConn.client.prepare(
        `select name, branch, state, updated_at from ${table}
         where name = ? and branch = ?`,
      );
    });
  }

  readonly #deleteStmt = new KeyedResolvOnce<Statement>();
  private async deleteStmt(url: URL) {
    return this.#deleteStmt.get(this.table(url)).once(async (table) => {
      await this.createTable(url);
      return this.dbConn.client.prepare(`delete from ${table} where name = ? and branch = ?`);
    });
  }
  async insert(url: URL, ose: WalRecord): Promise<RunResult> {
    const wal = WalSQLRecordBuilder.fromRecord(ose).build();
    const bufState = Buffer.from(this.textEncoder.encode(JSON.stringify(wal.state)));
    return this.insertStmt(url).then((i) =>
      i.run(ose.name, ose.branch, bufState, wal.updated_at.toISOString(), bufState, wal.updated_at.toISOString()),
    );
  }
  async select(url: URL, key: WalKey): Promise<WalRecord[]> {
    const res = (await this.selectStmt(url).then((i) => i.all(key.name, key.branch))).map((irow) => {
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
  async delete(url: URL, key: WalKey): Promise<RunResult> {
    this.logger.Debug().Str("name", key.name).Str("branch", key.branch).Msg("delete");
    return this.deleteStmt(url).then((i) => i.run(key.name, key.branch));
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async close(url: URL): Promise<Result<void>> {
    this.logger.Debug().Msg("close");
    return Result.Ok(undefined);
    // await this.dbConn.close();
  }
  async destroy(url: URL): Promise<Result<void>> {
    return exception2Result(async () => {
      this.logger.Debug().Msg("destroy");
      await this.createTable(url);
      await this.dbConn.client.prepare(`delete from ${this.table(url)}`).run();
    });
  }
}

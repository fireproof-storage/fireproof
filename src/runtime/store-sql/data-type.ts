import { RunResult, Statement } from "better-sqlite3";
import { DBConnection, SQLStore } from "./types";
import { SQLOpts, SQLiteConnection, ensureLogger, ensureTableNames } from "./sqlite-adapter-node";
import { Logger } from "@adviser/cement";
import { UploadDataFnParams } from "../../storage-engine/types";

export interface DataRecord {
  readonly name: string;
  readonly car: string;
  readonly data: Uint8Array;
  readonly updated_at: Date;
}

export class DataSQLRecordBuilder {
  readonly dataRecord: DataRecord;
  constructor(dataRecord: DataRecord) {
    this.dataRecord = dataRecord;
  }

  static fromUploadParams(data: Uint8Array, params: UploadDataFnParams): DataSQLRecordBuilder {
    return new DataSQLRecordBuilder({
      name: params.name,
      car: params.car,
      data: data,
      updated_at: new Date(),
    });
  }

  build(): DataRecord {
    return this.dataRecord;
  }
}

interface SQLiteDataRecord {
  name: string;
  car: string;
  data: Buffer;
  updated_at: string;
}

export type DataSQLStore = SQLStore<DataRecord, string>;

export class SQLiteDataStore implements DataSQLStore {
  readonly dbConn: SQLiteConnection;
  readonly table: string;
  readonly logger: Logger;
  _insertStmt?: Statement;
  _selectStmt?: Statement;
  _deleteStmt?: Statement;
  constructor(dbConn: SQLiteConnection, opts?: Partial<SQLOpts>) {
    this.dbConn = dbConn;
    this.table = ensureTableNames(opts).data;
    this.logger = ensureLogger(opts, "SQLiteDataStore");
    this.logger.Debug().Msg("constructor");
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

  async start(): Promise<SQLiteDataStore> {
    this.logger.Debug().Msg("start");
    await this.dbConn.connect();
    await this.dbConn.client
      .prepare(
        `CREATE TABLE IF NOT EXISTS ${this.table} (
            name TEXT NOT NULL,
            car TEXT PRIMARY KEY,
            data BLOB NOT NULL,
            updated_at TEXT NOT NULL)`,
      )
      .run();
    this._insertStmt = this.dbConn.client.prepare(`insert into ${this.table} (name, car, data, updated_at) values (?, ?, ?, ?)`);
    this._selectStmt = this.dbConn.client.prepare(`select name, car, data, updated_at from ${this.table} where car = ?`);
    this._deleteStmt = this.dbConn.client.prepare(`delete from ${this.table} where car = ?`);
    return this;
  }

  async insert(ose: DataRecord): Promise<RunResult> {
    this.logger.Debug().Str("name", ose.name).Str("car", ose.car).Uint64("data-len", ose.data.length).Msg("insert");
    return this.insertStmt.run(ose.name, ose.car, Buffer.from(ose.data), ose.updated_at.toISOString());
  }

  async select(car: string): Promise<DataRecord[]> {
    this.logger.Debug().Str("car", car).Msg("select");
    return (await this.selectStmt.all(car)).map((irow) => {
      const row = irow as SQLiteDataRecord;
      return {
        name: row.name,
        car: row.car,
        data: Uint8Array.from(row.data),
        updated_at: new Date(row.updated_at),
      };
    });
  }

  async delete(car: string): Promise<RunResult> {
    this.logger.Debug().Str("car", car).Msg("delete");
    return this.deleteStmt.run(car);
  }
}

export function DataStoreFactory(db: DBConnection, opts?: Partial<SQLOpts>): SQLStore<DataRecord, string> {
  if (db instanceof SQLiteConnection) {
    const store = new SQLiteDataStore(db, opts);
    return store;
  }
  throw ensureLogger(opts).Module("DataStoreFactory").Error().Msg("unsupported db connection").AsError();
}

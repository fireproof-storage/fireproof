import type { RunResult, Statement } from "node-sqlite3-wasm";
import { DBConnection, DataRecord, DataSQLStore } from "../../types.js";
import { V0_19NSWConnection } from "./sqlite-connection.js";
import { KeyedResolvOnce, Logger, Result } from "@adviser/cement";
import { UploadDataFnParams } from "../../../../blockstore/types.js";
import { ensureNSWVersion } from "./sqlite-ensure-version.js";
import { ensureLogger, exception2Result, getStore } from "../../../../utils.js";

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

// interface SQLiteDataRecord {
//   name: string;
//   car: string;
//   data: Buffer;
//   updated_at: string;
// }

export class V0_19NSWDataStore implements DataSQLStore {
  readonly dbConn: V0_19NSWConnection;
  readonly logger: Logger;
  constructor(dbConn: DBConnection) {
    this.dbConn = dbConn as V0_19NSWConnection;
    this.logger = ensureLogger(dbConn.opts, "V0_19NSWDataStore");
    this.logger.Debug().Msg("constructor");
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
            name TEXT NOT NULL,
            car TEXT PRIMARY KEY,
            data BLOB NOT NULL,
            updated_at TEXT NOT NULL)`,
        )
        .run();
    });
  }

  readonly #insertStmt = new KeyedResolvOnce<Statement>()
  private async insertStmt(url: URL) {
    return this.#insertStmt.get(this.table(url)).once(async (table) => {
      await this.createTable(url);
      return this.dbConn.client.prepare(`
        insert into ${table}
          (name, car, data, updated_at) values (:name, :car, :data, :updated_at)
          ON CONFLICT(car) DO UPDATE SET updated_at=:updated_at`);
    });
  }

  readonly #selectStmt = new KeyedResolvOnce<Statement>()
  private async selectStmt(url: URL) {
    return this.#selectStmt.get(this.table(url)).once(async (table) => {
      await this.createTable(url);
      return this.dbConn.client.prepare(`select name, car, data, updated_at from ${table} where car = :car`);
    });
  }

  readonly #deleteStmt = new KeyedResolvOnce<Statement>();
  private async deleteStmt(url: URL) {
    return this.#deleteStmt.get(this.table(url)).once(async (table) => {
      await this.createTable(url);
      return this.dbConn.client.prepare(`delete from ${table} where car = :car`);
    });
  }

  async start(url: URL): Promise<void> {
    this.logger.Debug().Msg("start-connect");
    await this.dbConn.connect();
    this.logger.Debug().Msg("start-connected");
    await ensureNSWVersion(url, this.dbConn);
    this.logger.Debug().Msg("start-set-version");
  }

  async insert(url: URL, ose: DataRecord): Promise<RunResult> {
    this.logger.Debug().Str("name", ose.name).Str("car", ose.car).Uint64("data-len", ose.data.length).Msg("insert");
    const updated_at = ose.updated_at.toISOString();
    return this.insertStmt(url).then((i) => i.run({
      ':name': ose.name,
      ':car': ose.car,
      ':data': ose.data,
      ':updated_at': updated_at,
  }));
  }

  async select(url: URL, car: string): Promise<DataRecord[]> {
    this.logger.Debug().Str("car", car).Msg("select");
    return (await this.selectStmt(url).then((i) => i.all({
      ':car': car,
    }))).map((irow) => {
      const row = irow // as SQLiteDataRecord;
      return {
        name: row.name?.toString() as string,
        car: row.car?.toString() as string,
        data: row.data?.valueOf() as Uint8Array,
        updated_at: new Date(row.updated_at?.toString() as string),
      };
    });
  }

  async delete(url: URL, car: string): Promise<RunResult> {
    this.logger.Debug().Str("car", car).Msg("delete");
    const ret = await this.deleteStmt(url).then((i) => i.run({':car': car }));
    // await this.select(car);
    return ret;
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

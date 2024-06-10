import { Database, RunResult, Statement } from "better-sqlite3";
import { DBConnection, Store, UploadDataFnParams } from "./types";
import { SQLiteConnection } from "./sqlite-adapter";

export interface DataType {
    readonly type: 'data'
    readonly car: string
    readonly size: number
    readonly data: Uint8Array
}

export interface DataRecord {
    readonly car: string;
    readonly blob: Uint8Array
    readonly created_at: Date;
}

export class DataSQLRecordBuilder {
    #car?: string;
    #size?: string;
    #data?: Uint8Array;

    static fromUploadParams(data: Uint8Array, params: UploadDataFnParams): DataSQLRecordBuilder {
        const bld = new DataSQLRecordBuilder()
        bld.#car = params.car
        bld.#data = data
        bld.#size = params.size
        return bld
    }

    build(): DataRecord {
        return {
            car: this.#car!,
            blob: Buffer.from(this.#data!),
            created_at: new Date()
        }
    }

}

class SQLiteDataStore implements Store<DataRecord, string> {
    readonly client: Database;
    readonly table: string;
    insertStmt?: Statement;
    selectStmt?: Statement;
    constructor(client: Database, table: string = 'objectstore') {
        this.client = client
        this.table = table
    }

    async start(): Promise<SQLiteDataStore> {
        await this.client.prepare(`CREATE TABLE IF NOT EXISTS ${this.table} (
        car TEXT PRIMARY KEY,
        blob BLOB NOT NULL,
        updated_at TEXT NOT NULL)`)
            .run()
        this.insertStmt = this.client.prepare(`insert into ${this.table} (car, blob, updated_at)
          values (?, ?, ?)
          ON CONFLICT(car) DO UPDATE SET blob=?, updated_at=?`)
        this.selectStmt = this.client.prepare(`select car, blob, updated_at from ${this.table} where car = ?`)
        return this
    }

    async insert(ose: DataRecord): Promise<RunResult> {
        return this.insertStmt!.run(ose.car, ose.blob, ose.created_at.toISOString(),
            ose.blob, ose.created_at.toISOString())
    }
    async select(car: string): Promise<RunResult> {
        return this.selectStmt!.run(car)
    }

}

export async function DataStoreFactory(db: DBConnection): Promise<Store<DataRecord, string>> {
    if (db instanceof SQLiteConnection) {
        const store = new SQLiteDataStore(db.client!)
        await store.start()
        return store
    }
    throw new Error('unsupported db connection')
}
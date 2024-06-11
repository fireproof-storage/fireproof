import { Database, RunResult, Statement } from "better-sqlite3";
import { DBConnection, Store, UploadDataFnParams } from "./types";
import { SQLiteConnection } from "./sqlite-adapter-node";

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

interface SQLiteDataRecord {
    car: string
    blob: Uint8Array
    updated_at: string
}


class SQLiteDataStore implements Store<DataRecord, string> {
    readonly dbConn: SQLiteConnection;
    readonly table: string;
    insertStmt?: Statement;
    selectStmt?: Statement;
    constructor(dbConn: SQLiteConnection, table: string = 'objectstore') {
        this.dbConn = dbConn
        this.table = table
    }

    async start(): Promise<SQLiteDataStore> {
        await this.dbConn.connect()
        await this.dbConn.client!.prepare(`CREATE TABLE IF NOT EXISTS ${this.table} (
        car TEXT PRIMARY KEY,
        blob BLOB NOT NULL,
        updated_at TEXT NOT NULL)`)
            .run()
        this.insertStmt = this.dbConn.client!.prepare(`insert into ${this.table} (car, blob, updated_at)
          values (?, ?, ?)
          ON CONFLICT(car) DO UPDATE SET blob=?, updated_at=?`)
        this.selectStmt = this.dbConn.client!.prepare(`select car, blob, updated_at from ${this.table} where car = ?`)
        return this
    }

    async insert(ose: DataRecord): Promise<RunResult> {
        return this.insertStmt!.run(ose.car, ose.blob, ose.created_at.toISOString(),
            ose.blob, ose.created_at.toISOString())
    }
    async select(car: string): Promise<DataRecord[]> {
        return (await this.selectStmt!.all(car)).map(irow => {
            const row = irow as SQLiteDataRecord
            return {
                car: row.car,
                blob: row.blob,
                created_at: new Date(row.updated_at)
            }
        })
    }

}

export function DataStoreFactory(db: DBConnection): Store<DataRecord, string> {
    if (db instanceof SQLiteConnection) {
        const store = new SQLiteDataStore(db)
        return store
    }
    throw new Error('unsupported db connection')
}
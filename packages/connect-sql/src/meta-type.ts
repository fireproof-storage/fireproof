import { Database, RunResult, Statement } from "better-sqlite3";
import { DBConnection, Store, UploadMetaFnParams } from "./types";
import { SQLiteConnection } from "./sqlite-adapter-node";

export interface MetaType {
    readonly name: string
    readonly branch: string
    readonly blob: Uint8Array
}

export interface MetaRecordKey {
    readonly name: string
    readonly branch: string
}

export interface MetaRecord extends MetaRecordKey {
    readonly blob: Uint8Array
    readonly updated_at: Date;
}

export class MetaSQLRecordBuilder {
    #name?: string;
    #branch?: string;
    #blob?: Uint8Array;

    static fromUploadMetaFnParams(data: Uint8Array, params: UploadMetaFnParams): MetaSQLRecordBuilder {
        const bld = new MetaSQLRecordBuilder()
        bld.#name = params.name
        bld.#branch = params.branch
        bld.#blob = data
        return bld
    }

    build(): MetaRecord {
        return {
            name: this.#name!,
            branch: this.#branch!,
            blob: Buffer.from(this.#blob!),
            updated_at: new Date()
        }
    }

}

interface SQLiteMetaRecord {
    name: string
    branch: string
    blob: Uint8Array
    updated_at: string
}


class SQLiteMetaStore implements Store<MetaRecord, MetaRecordKey> {
    readonly dbConn: SQLiteConnection;
    insertStmt?: Statement;
    selectStmt?: Statement;
    readonly table: string;
    constructor(dbConn: SQLiteConnection, table: string = 'metastore') {
        this.dbConn = dbConn
        this.table = table
    }
    async start(): Promise<SQLiteMetaStore> {
        await this.dbConn.connect()
        await this.dbConn.client!.prepare(`CREATE TABLE IF NOT EXISTS ${this.table} (
        name TEXT not null,
        branch TEXT not null,
        blob BLOB NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (name, branch)
        )`)
            .run()
        this.insertStmt = this.dbConn.client!.prepare(`insert into ${this.table}
          (name, branch, blob, updated_at)
          values (?, ?, ?, ?)
          ON CONFLICT(name, branch) DO UPDATE SET blob=?, updated_at=?
          `)
        this.selectStmt = this.dbConn.client!.prepare(`select name, branch, blob, updated_at from ${this.table} where name = ? and branch = ?`)
        return this
    }

    async insert(ose: MetaRecord): Promise<RunResult> {
        return this.insertStmt!.run(ose.name, ose.branch, ose.blob, ose.updated_at.toISOString(),
            ose.blob, ose.updated_at.toISOString())
    }
    async select(key: MetaRecordKey): Promise<MetaRecord[]> {
        return (await this.selectStmt!.all(key.name, key.branch)).map((irow) => {
            const row = irow as SQLiteMetaRecord
            return {
                name: row.name,
                branch: row.branch,
                blob: row.blob,
                updated_at: new Date(row.updated_at)
            }
        })
    }

}


export function MetaStoreFactory(db: DBConnection): Store<MetaRecord, MetaRecordKey> {
    if (db instanceof SQLiteConnection) {
        const store = new SQLiteMetaStore(db)
        return store
    }
    throw new Error('unsupported db connection')
}
import { Database, RunResult, Statement } from "better-sqlite3";
import { DBConnection, Store, UploadMetaFnParams } from "./types";
import { SQLiteConnection } from "./sqlite-adapter";

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



class SQLiteMetaStore implements Store<MetaRecord, MetaRecordKey> {
    readonly client: Database;
    insertStmt?: Statement;
    selectStmt?: Statement;
    readonly table: string;
    constructor(client: Database, table: string = 'metastore') {
        this.client = client
        this.table = table
    }
    async start(): Promise<SQLiteMetaStore> {
        await this.client.prepare(`CREATE TABLE IF NOT EXISTS ${this.table} (
        name TEXT not null,
        branch TEXT not null,
        blob BLOB NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (name, branch)
        )`)
            .run()
        this.insertStmt = this.client.prepare(`insert into ${this.table}
          (name, branch, blob, updated_at)
          values (?, ?, ?, ?)
          ON CONFLICT(name, branch) DO UPDATE SET blob=?, updated_at=?
          `)
        this.selectStmt = this.client.prepare(`select name, branch, blob, updated_at from ${this.table} where name = ? and branch = ?`)
        return this
    }

    async insert(ose: MetaRecord): Promise<RunResult> {
        return this.insertStmt!.run(ose.name, ose.branch, ose.blob, ose.updated_at.toISOString(),
            ose.blob, ose.updated_at.toISOString())
    }
    async select(key: MetaRecordKey): Promise<RunResult> {
        return this.selectStmt!.run(key.name, key.branch)
    }

}

export async function MetaStoreFactory(db: DBConnection): Promise<Store<MetaRecord, MetaRecordKey>> {
    if (db instanceof SQLiteConnection) {
        const store = new SQLiteMetaStore(db.client!)
        await store.start()
        return store
    }
    throw new Error('unsupported db connection')
}
import { RunResult, Statement } from "better-sqlite3";
import { DBConnection, SQLStore, UploadMetaFnParams } from "./types";
import { SQLOpts, SQLiteConnection, ensureLogger, ensureTableNames, textDecoder } from "./sqlite-adapter-node";
import { DbMeta } from "@fireproof/encrypted-blockstore";
import { Logger } from "@adviser/cement";

export interface MetaType {
    readonly name: string
    readonly branch: string
    readonly meta: Uint8Array
}

export interface MetaRecordKey {
    readonly name: string
    readonly branch: string
}

export interface MetaRecord extends MetaRecordKey {
    readonly meta: Uint8Array
    readonly updated_at: Date;
}

const textEncoder = new TextEncoder();

export class MetaSQLRecordBuilder {
    readonly record: MetaRecord

    constructor(record: MetaRecord) {
        this.record = record
    }

    static fromUploadMetaFnParams(data: Uint8Array, params: UploadMetaFnParams): MetaSQLRecordBuilder {
        return new MetaSQLRecordBuilder({
            name: params.name,
            branch: params.branch,
            meta: data,
            updated_at: new Date()
        })
    }

    static fromBytes(str: string, name: string, branch: string): MetaSQLRecordBuilder {
        return new MetaSQLRecordBuilder({
            name: name,
            branch: branch,
            meta: textEncoder.encode(str),
            updated_at: new Date()
        })

    }

    build(): MetaRecord {
        return this.record
    }

}

interface SQLiteMetaRecord {
    name: string
    branch: string
    meta: Buffer
    updated_at: string
}

export type MetaSQLStore = SQLStore<MetaRecord, MetaRecordKey>

class SQLiteMetaStore implements MetaSQLStore {
    insertStmt?: Statement;
    selectStmt?: Statement;
    deleteStmt?: Statement;
    readonly dbConn: SQLiteConnection;
    readonly table: string;
    readonly logger: Logger;
    constructor(dbConn: SQLiteConnection, opts?: Partial<SQLOpts>) {
        this.dbConn = dbConn
        this.table = ensureTableNames(opts).meta
        this.logger = ensureLogger(opts, 'SQLiteMetaStore').With().Str("table", this.table).Logger()
        this.logger.Debug().Msg("constructor");
    }
    async start(): Promise<SQLiteMetaStore> {
        this.logger.Debug().Msg("start");
        await this.dbConn.connect()
        await this.dbConn.client!.prepare(`CREATE TABLE IF NOT EXISTS ${this.table} (
        name TEXT not null,
        branch TEXT not null,
        meta BLOB NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (name, branch)
        )`)
            .run()
        this.insertStmt = this.dbConn.client!.prepare(`insert into ${this.table}
          (name, branch, meta, updated_at)
          values (?, ?, ?, ?)
          ON CONFLICT(name, branch) DO UPDATE SET meta=?, updated_at=?
          `)
        this.selectStmt = this.dbConn.client!.prepare(`select name, branch, meta, updated_at from ${this.table} where name = ? and branch = ?`)
        this.deleteStmt = this.dbConn.client!.prepare(`delete from ${this.table} where name = ? and branch = ?`)
        return this
    }

    async insert(ose: MetaRecord): Promise<RunResult> {
        this.logger.Debug().Str("name", ose.name).Str("branch", ose.branch).Uint64("data-len", ose.meta.length).Msg("insert")
        const bufMeta = Buffer.from(ose.meta)
        return this.insertStmt!.run(ose.name, ose.branch, bufMeta, ose.updated_at.toISOString(), bufMeta, ose.updated_at.toISOString())
    }
    async select(key: MetaRecordKey): Promise<MetaRecord[]> {
        this.logger.Debug().Str("name", key.name).Str("branch", key.branch).Msg("select")
        return (await this.selectStmt!.all(key.name, key.branch)).map((irow) => {
            const row = irow as SQLiteMetaRecord
            return {
                name: row.name,
                branch: row.branch,
                meta: Uint8Array.from(row.meta),
                updated_at: new Date(row.updated_at)
            }
        })
    }

    async delete(key: MetaRecordKey): Promise<RunResult> {
        this.logger.Debug().Str("name", key.name).Str("branch", key.branch).Msg("delete")
        return this.deleteStmt!.run(key.name, key.branch)
    }

}


export function MetaStoreFactory(db: DBConnection, opts?: Partial<SQLOpts>): SQLStore<MetaRecord, MetaRecordKey> {
    if (db instanceof SQLiteConnection) {
        const store = new SQLiteMetaStore(db, opts)
        return store
    }
    throw ensureLogger(opts, "MetaStoreFactory").Error().Msg('unsupported db connection').AsError()
}
import { Database } from 'better-sqlite3';
import path from 'path';
import { DBConnection } from './types';
import { ConnectSQLOptions } from './connect-sql-node';
import { DataSQLRecordBuilder, DataStoreFactory } from './data-type';
import { MetaSQLRecordBuilder, MetaStoreFactory } from './meta-type';
import { SQLFactory } from './sql';
import { AnyBlock, AnyLink, DataStore, DbMeta, Loader, MetaStore, RemoteWAL, StoreOpts, WALState } from '@fireproof/encrypted-blockstore';


export function SimpleSQLite(filename: string): ConnectSQLOptions {
    const db = SQLiteConnection.fromFilename(filename)
    return {
        objectStore: DataStoreFactory(db),
        metaStore: MetaStoreFactory(db)
    }
}

export class SQLiteMetaStore extends MetaStore {
    readonly loader: Loader

    constructor(loader: Loader) {
        super("sqlite-meta-store")
        this.loader = loader
    }

    async load(branch?: string | undefined): Promise<DbMeta[] | null> {
        console.log(`SQLiteMetaStore:load Method not implemented.: ${branch}, ${JSON.stringify(this.loader.name)}`);
        return null

    }
    async save(dbMeta: DbMeta, branch?: string | undefined): Promise<DbMeta[] | null> {
        console.log(`SQLiteMetaStore:save Method not implemented.: ${JSON.stringify(dbMeta)} ${branch}, ${JSON.stringify(this.loader.name)}`);
        return null
    }

}

export class SQLiteDataStore extends DataStore {
    readonly name: string
    constructor(name: string) {
        super("sqlite-data-store")
        this.name = name
    }
    async load(cid: AnyLink): Promise<AnyBlock> {
        console.log(`SQLiteDataStore:load Method not implemented.${cid}, ${this.name}`);
        return { cid: cid, bytes: new Uint8Array() }

    }
    async save(car: AnyBlock, opts?: { public?: boolean | undefined; } | undefined): Promise<void | AnyLink> {
        console.log(`SQLiteDataStore:save Method not implemented.${JSON.stringify(car)} ${opts}, ${this.name}`);
    }
    async remove(cid: AnyLink): Promise<void> {
        console.log(`SQLiteDataStore:remove Method not implemented.${cid}, ${this.name}`);
    }
}

export class SQLiteRemoteWAL extends RemoteWAL {
    constructor(loader: Loader) {
        super(loader)
    }
    async load(branch?: string | undefined): Promise<WALState | null> {
        console.log(`SQLiteRemoteWAL:load Method not implemented.: ${branch}, ${JSON.stringify(this.loader.name)}`);
        return null
    }
    async save(state: WALState, branch?: string | undefined): Promise<void> {
        console.log(`SQLiteRemoteWAL:save Method not implemented.${JSON.stringify(state)} ${branch}, ${JSON.stringify(this.loader.name)}`);
    }
}

export function SQLLiteStoreOptions(filename: string = path.join((process.env.HOME || "./") + ".fireproof", "db.sqlite")): StoreOpts {
    return {
        makeMetaStore: (loader: Loader) => {
            return new SQLiteMetaStore(loader);
        },
        makeDataStore: (name: string) => {
            return new SQLiteDataStore(name);
        },
        makeRemoteWAL: (loader: Loader) => {
            return new SQLiteRemoteWAL(loader);
        }
    }
}


export class SQLiteConnection implements DBConnection {
    static fromFilename(filename: string): DBConnection {
        return new SQLiteConnection(filename)
    }
    readonly filename: string
    client?: Database
    private constructor(filename: string) {
        console.log('sqlite constructor', filename);
        this.filename = filename
    }
    async connect(): Promise<void> {
        console.log('sqlite connect');
        const Sqlite3Database = (await import('better-sqlite3')).default;
        this.client = new Sqlite3Database(this.filename, {
            // verbose: console.log,
            nativeBinding: "./node_modules/better-sqlite3/build/Release/better_sqlite3.node"
        });
    }
    async close(): Promise<void> {
        this.client?.close()
    }
}

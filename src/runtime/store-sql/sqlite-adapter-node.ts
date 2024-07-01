import type { Database } from "better-sqlite3";

// import { format, parse, ToString } from '@ipld/dag-json'

// import { DBConnection } from './types';
// import { StoreOptions } from './connect-sql-node';
// import { DataStoreFactory, DataSQLStore } from './data-type';
// import { MetaStoreFactory, MetaSQLStore, MetaSQLRecordBuilder } from './meta-type';
// import { AnyBlock, AnyLink, DbMeta, Loader, RemoteWAL, WALState, DataStore, MetaStore } from '../../storage-engine/index';
// import { WalSQLStore, WalStoreFactory } from './wal-type';
import { Logger, LoggerImpl } from "@adviser/cement";
import { DBConnection } from "./types.js";
import { SysContainer } from "../sys-container.js";

export interface SQLTableNames {
  readonly data: string;
  readonly meta: string;
  readonly wal: string;
}

export const DefaultSQLTableNames: SQLTableNames = {
  data: "Datas",
  meta: "Metas",
  wal: "Wals",
};

export interface SQLOpts {
  readonly tableNames: SQLTableNames;
  readonly logger: Logger;
}

const globalLogger = new LoggerImpl();

// export const textEncoder = new TextEncoder()
// export const textDecoder = new TextDecoder()

export function ensureLogger(opts?: Partial<SQLOpts>, componentName?: string): Logger {
  // if (!opts?.logger) {
  //   throw new Error("logger is required");
  // }
  const logger = opts?.logger || globalLogger;
  if (componentName) {
    return logger.With().Module(componentName).Logger();
  }
  return logger;
}

export function ensureTableNames(opts?: Partial<SQLOpts>): SQLTableNames {
  return opts?.tableNames || DefaultSQLTableNames;
}

// export function SimpleSQLite(filename: string, opts?: Partial<SQLOpts>): StoreOpts {
//     ensureLogger(opts, "SimpleSQLite").Debug().Str("filename", filename).Msg("SimpleSQLite")
//     const db = SQLiteConnection.fromFilename(filename, opts)
//     return SQLiteStoreOptions({
//         data: DataStoreFactory(db, opts),
//         meta: MetaStoreFactory(db, opts),
//         wal: WalStoreFactory(db, opts)
//     }, opts)
// }

// export class SQLMetaStore extends MetaStore {
//     readonly loader: Loader
//     readonly store: MetaSQLStore
//     readonly logger: Logger

//     needInit = true

//     constructor(store: MetaSQLStore, loader: Loader, opts?: Partial<SQLOpts>) {
//         super("sqlite-meta-store")
//         this.store = store
//         this.loader = loader
//         this.logger = ensureLogger(opts, "SQLMetaStore").With().Str("name", loader.name).Logger()
//         this.logger.Debug().Msg("constructor")
//     }

//     async init(): Promise<void> {
//         if (this.needInit) {
//             this.logger.Debug().Msg("init")
//             await this.store.start()
//             this.needInit = false
//         }
//     }

//     /*
//        {
//        "cars":[{"/":"bafkreihfweuqwjnub6pz23suyg2ud7zhojbms3v7d6slyqu577t7rluupe"}],
//        "key":"5cc3d17d01b3d2e24278deffddc6757ab7ed3fcf5094ecf0a584699b6d918c71"
//        }
//     */

//     async load(branch = 'main'): Promise<DbMeta[] | null> {
//         await this.init()
//         const metas = await this.store.select({ name: this.loader.name, branch: branch })
//         if (metas.length === 0) {
//             return null
//         }
//         const ret = this.parseHeader(textDecoder.decode(metas[0]?.meta))
//         this.logger.Debug().Str("branch", branch || 'main').Any("meta", ret).Msg("load")
//         return [ret]
//     }
//     async save(dbMeta: DbMeta, branch = 'main'): Promise<DbMeta[] | null> {
//         await this.init()
//         this.logger.Debug().Any("dbMeta", dbMeta).Str("branch", branch!).Msg("save")
//         await this.store.insert(MetaSQLRecordBuilder.fromBytes(this.makeHeader(dbMeta), this.loader.name, branch).build())
//         return null
//     }

// }

// export class SQLDataStore extends DataStore {
//     readonly name: string
//     readonly store: DataSQLStore
//     readonly logger: Logger
//     needInit = true
//     constructor(store: DataSQLStore, name: string, opts?: Partial<SQLOpts>) {
//         super("sqlite-data-store")
//         this.store = store
//         this.name = name
//         this.logger = ensureLogger(opts, "SQLDataStore").With().Str("name", name).Logger()
//     }
//     async init(): Promise<void> {
//         if (this.needInit) {
//             this.logger.Debug().Msg("init")
//             await this.store.start()
//             this.needInit = false
//         }
//     }

//     async load(cid: AnyLink): Promise<AnyBlock> {
//         await this.init()
//         this.logger.Debug().Str("cid", cid.toString()).Msg("load")
//         const ret = await this.store.select(cid.toString())
//         if (ret.length > 0) {
//             return { cid: cid, bytes: new Uint8Array(ret[0].data) }
//         }
//         throw this.logger.Error().Str("cid", cid.toString()).Msg("load failed").AsError()
//     }
//     async save(car: AnyBlock): Promise<void> {
//         await this.init()
//         this.logger.Debug().Str("car", car.cid.toString()).Uint64("blob", car.bytes.length).Msg("save")
//         await this.store.insert({
//             name: this.name,
//             car: car.cid.toString(),
//             data: car.bytes,
//             updated_at: new Date()
//         })
//     }
//     async remove(cid: AnyLink): Promise<void> {
//         await this.init()
//         this.logger.Debug().Str("cid", cid.toString()).Msg("remove")
//         await this.store.delete(cid.toString())
//     }
// }

// export class SQLRemoteWAL extends RemoteWAL {
//     readonly store: WalSQLStore
//     needInit = true
//     readonly logger: Logger
//     constructor(store: WalSQLStore, loader: Loader, opts?: Partial<SQLOpts>) {
//         super(loader)
//         this.store = store
//         this.logger = ensureLogger(opts, "SQLRemoteWAL").With().Str("name", loader.name).Logger()
//     }

//     async init(): Promise<void> {
//         if (this.needInit) {
//             this.logger.Debug().Msg("init")
//             await this.store.start()
//             this.needInit = false
//         }
//     }

//     async load(branch = 'main'): Promise<WALState | null> {
//         await this.init()
//         const res = await this.store.select({ name: this.loader.name, branch: branch })
//         if (res.length === 0) {
//             return null
//         }
//         const ret = parse<WALState>(textDecoder.decode(res[0]?.state))
//         this.logger.Debug().Str("branch", branch).Any("state", ret).Msg("load")
//         return ret

//     }
//     async save(state: WALState, branch?: string): Promise<void> {
//         await this.init()
//         const encoded: ToString<WALState> = format(state)
//         this.logger.Debug().Any("state", state).Str("branch", branch || "main").Msg("save")
//         await this.store.insert({
//             state: textEncoder.encode(encoded.toString()),
//             updated_at: new Date(),
//             name: this.loader.name,
//             branch: branch || 'main'
//         })
//     }
// }

// // export function SQLiteStoreOptions(cso: StoreOptions, opts?: Partial<SQLOpts>): StoreOpts {
// //     const logger = ensureLogger(opts, "SQLiteStoreOptions")
// //     logger.Debug().Msg("SQLiteStoreOptions")
// //     return {
// //         makeMetaStore: (loader: Loader) => {
// //             logger.Debug().Msg("makeMetaStore")
// //             return new SQLMetaStore(cso.meta, loader, opts);
// //         },
// //         makeDataStore: (name: string) => {
// //             logger.Debug().Msg("makeDataStore")
// //             return new SQLDataStore(cso.data, name, opts);
// //         },
// //         makeRemoteWAL: (loader: Loader) => {
// //             logger.Debug().Msg("makeRemoteWAL")
// //             return new SQLRemoteWAL(cso.wal, loader, opts);
// //         }
// //     }
// // }

export class SQLiteConnection implements DBConnection {
  static fromURL(url: URL, opts?: Partial<SQLOpts>): DBConnection {
    let filename = url.toString().replace("sqlite://", "");
    if (!filename.endsWith(".sqlite")) {
      filename += ".sqlite";
    }
    return new SQLiteConnection(filename, opts);
  }
  readonly filename: string;
  readonly logger: Logger;
  _client?: Database;

  get client(): Database {
    if (!this._client) {
      throw this.logger.Error().Msg("client not connected").AsError();
    }
    return this._client;
  }

  private constructor(filename: string, opts?: Partial<SQLOpts>) {
    this.logger = ensureLogger(opts, "SQLiteConnection").With().Str("filename", filename).Logger();
    this.filename = filename;
    this.logger.Debug().Msg("constructor");
  }
  readonly connects: Promise<void>[] = [];
  isConnected = false;
  async connect(): Promise<void> {
    if (this.connects.length > 0) {
      const onConnected = new Promise<void>(() => {
        return;
      });
      this.connects.push(onConnected);
      return onConnected;
    }
    this.logger.Debug().Msg("connect");
    const Sqlite3Database = (await import("better-sqlite3")).default;
    await SysContainer.mkdir(SysContainer.dirname(this.filename), { recursive: true });
    this._client = new Sqlite3Database(this.filename, {
      // verbose: console.log,
      nativeBinding: "./node_modules/better-sqlite3/build/Release/better_sqlite3.node",
    });
    // this.logger.Debug().Any("client", this.client).Msg("connected")
    if (!this._client) {
      throw this.logger.Error().Msg("connect failed").AsError();
    }
    this.isConnected = true;
    const toResolve = [...this.connects];
    this.connects.splice(0, -1);
    await Promise.all(toResolve);
  }
  async close(): Promise<void> {
    this.logger.Debug().Msg("close");
    this.client.close();
  }
}

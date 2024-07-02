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
import { ResolveOnce } from "../../storage-engine/resolve-once.js";

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

const onceSQLiteConnections = new Map<string, ResolveOnce<Database>>();
export class SQLiteConnection implements DBConnection {
  static fromURL(url: URL, opts?: Partial<SQLOpts>): DBConnection {
    return new SQLiteConnection(url, opts);
  }
  readonly url: URL;
  readonly logger: Logger;
  _client?: Database;

  get client(): Database {
    if (!this._client) {
      throw this.logger.Error().Msg("client not connected").AsError();
    }
    return this._client;
  }

  private constructor(url: URL, opts?: Partial<SQLOpts>) {
    this.logger = ensureLogger(opts, "SQLiteConnection").With().Str("url", url.toString()).Logger();
    this.url = url;
    this.logger.Debug().Msg("constructor");
  }
  async connect(): Promise<void> {
    let fName = this.url.toString().replace("sqlite://", "").replace(/\?.*$/, "");
    if (!fName.endsWith(".sqlite")) {
      fName += ".sqlite";
    }
    let ro = onceSQLiteConnections.get(fName);
    if (!ro) {
      ro = new ResolveOnce();
      onceSQLiteConnections.set(fName, ro);
    }
    this._client = await ro.once(async () => {
      this.logger.Debug().Str("filename", fName).Msg("connect");
      const Sqlite3Database = (await import("better-sqlite3")).default;
      await SysContainer.mkdir(SysContainer.dirname(fName), { recursive: true });
      const db = new Sqlite3Database(fName, {
        // verbose: console.log,
        nativeBinding: "./node_modules/better-sqlite3/build/Release/better_sqlite3.node",
      });
      // this.logger.Debug().Any("client", this.client).Msg("connected")
      if (!db) {
        throw this.logger.Error().Msg("connect failed").AsError();
      }
      return db;
    });
  }
  async close(): Promise<void> {
    this.logger.Debug().Msg("close");
    await this.client.close();
  }
}

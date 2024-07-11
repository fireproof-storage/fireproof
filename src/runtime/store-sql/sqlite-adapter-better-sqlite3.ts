import type { Database } from "better-sqlite3";
import { KeyedResolvOnce, Logger } from "@adviser/cement";

import { DBConnection, SQLOpts } from "./types.js";
import { SysContainer } from "../sys-container.js";
import { ensureSQLOpts } from "./ensurer.js";

// export function SimpleSQLite(filename: string, opts?: Partial<SQLOpts>): StoreOpts {
//     ensureLogger(opts, "SimpleSQLite").Debug().Str("filename", filename).Msg("SimpleSQLite")
//     const db = SQLiteConnection.fromFilename(filename, opts)
//     return SQLiteStoreOptions({
//         data: DataStoreFactory(db, opts),
//         meta: MetaStoreFactory(db, opts),
//         wal: WalStoreFactory(db, opts)
//     }, opts)
// }

const onceSQLiteConnections = new KeyedResolvOnce<Database>();
export class SQLiteConnection implements DBConnection {
  static fromURL(url: URL, opts: Partial<SQLOpts> = {}): DBConnection {
    return new SQLiteConnection(url, opts);
  }
  readonly url: URL;
  readonly logger: Logger;
  _client?: Database;

  readonly opts: SQLOpts;

  get client(): Database {
    if (!this._client) {
      throw this.logger.Error().Msg("client not connected").AsError();
    }
    return this._client;
  }

  private constructor(url: URL, opts: Partial<SQLOpts>) {
    // console.log("better-sqlite3->url->", url);
    this.opts = ensureSQLOpts(url, opts, "SQLiteConnection", { url });
    this.logger = this.opts.logger;
    this.url = url;
    this.logger.Debug().Msg("constructor");
  }
  async connect(): Promise<void> {
    let fName = this.url.toString().replace("sqlite://", "").replace(/\?.*$/, "");
    if (!fName) {
      throw this.logger.Error().Str("url", this.url.toString()).Msg("filename is empty").AsError();
    }
    // const version = this.url.searchParams.get("version");
    // if (!version) {
    //   throw this.logger.Error().Str("url", this.url.toString()).Msg("version not found").AsError();
    // }
    const hasName = this.url.searchParams.get("name");
    if (hasName) {
      fName = SysContainer.join(fName, hasName);
      if (!fName.endsWith(".sqlite")) {
        fName += ".sqlite";
      }
    }
    this._client = await onceSQLiteConnections.get(fName).once(async () => {
      this.logger.Debug().Str("filename", fName).Msg("connect");
      const Sqlite3Database = (await import("better-sqlite3")).default;
      if (hasName) {
        await SysContainer.mkdir(SysContainer.dirname(fName), { recursive: true });
      }
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

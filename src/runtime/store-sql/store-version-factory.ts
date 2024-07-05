import { Logger } from "@adviser/cement";
import { ensureLogger, LoggerOpts } from "../../utils";
import { DBConnection, DataSQLStore, MetaSQLStore, WalSQLStore } from "./types";
import { SQLITE_VERSION } from "./v0.19-sqlite/version";

export function ensureSQLVersion(url: URL, opts: LoggerOpts|Logger): URL {
  if (url.searchParams.get("version")) return url;

  switch (url.protocol) {
    case "sqlite:": {
      const ourl = new URL(url.toString());
      ourl.searchParams.set("version", SQLITE_VERSION);
      return ourl;
    }
    default:
      throw ensureLogger(opts, "ensureSQLVersion").Error().Str("url", url.toString()).Msg("unsupported protocol").AsError();
  }
}

export async function WalStoreFactory(db: DBConnection): Promise<WalSQLStore> {
  switch (db.opts.sqlFlavor) {
    case "sqlite": {
      const { V0_18_0SQLiteWalStore } = await import("./v0.19-sqlite/sqlite-wal-store.js");
      const store = new V0_18_0SQLiteWalStore(db);
      return store;
    }
    default:
      throw ensureLogger(db.opts, "WalStoreFactory").Error().Msg("unsupported db connection").AsError();
  }
}

export async function DataStoreFactory(db: DBConnection): Promise<DataSQLStore> {
  switch (db.opts.sqlFlavor) {
    case "sqlite": {
      const { V0_18_0SQLiteDataStore } = await import("./v0.19-sqlite/sqlite-data-store.js");
      const store = new V0_18_0SQLiteDataStore(db);
      return store;
    }
    default:
      throw ensureLogger(db.opts, "DataStoreFactory").Error().Msg("unsupported db connection").AsError();
  }
}

export async function MetaStoreFactory(db: DBConnection): Promise<MetaSQLStore> {
  switch (db.opts.sqlFlavor) {
    case "sqlite": {
      const { V0_18_0SQLiteMetaStore } = await import("./v0.19-sqlite/sqlite-meta-store.js");
      const store = new V0_18_0SQLiteMetaStore(db);
      return store;
    }
    default:
      throw ensureLogger(db.opts, "MetaStoreFactory").Error().Msg("unsupported db connection").AsError();
  }
}

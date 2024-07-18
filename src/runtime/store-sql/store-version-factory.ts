// import { Logger } from "@adviser/cement";
import { ensureLogger } from "../../utils.js";
import { DBConnection, DataSQLStore, MetaSQLStore, WalSQLStore } from "./types.js";
import { v0_19sqliteDataFactory, v0_19sqliteMetaFactory, v0_19sqliteWalFactory } from './v0.19/sqlite_factory.js';
// import { SQLITE_VERSION } from "./v0.19-better-sqlite3/version";

// export function prepareSQLVersion(iurl: URL, opts: LoggerOpts | Logger): URL {
//   if (iurl.searchParams.get("version")) return iurl;
//   const url = new URL(iurl.toString());
//   switch (url.protocol) {
//     case "sqlite:":
//       {
//         url.searchParams.set("version", SQLITE_VERSION);
//       }
//       break;
//     default:
//       throw ensureLogger(opts, "ensureSQLVersion").Error().Str("url", url.toString()).Msg("unsupported protocol").AsError();
//   }
//   return url;
// }

export async function WalStoreFactory(db: DBConnection): Promise<WalSQLStore> {
  switch (db.opts.sqlGestalt.flavor) {
    case "sqlite":
      return v0_19sqliteWalFactory(db.opts.sqlGestalt);
    default:
      throw ensureLogger(db.opts, "WalStoreFactory").Error().Msg("unsupported db connection").AsError();
  }
}

export async function DataStoreFactory(db: DBConnection): Promise<DataSQLStore> {
  switch (db.opts.sqlGestalt.flavor) {
    case "sqlite":
      return v0_19sqliteDataFactory(db.opts.sqlGestalt);
    default:
      throw ensureLogger(db.opts, "DataStoreFactory").Error().Msg("unsupported db connection").AsError();
  }
}

export async function MetaStoreFactory(db: DBConnection): Promise<MetaSQLStore> {
  switch (db.opts.sqlGestalt.flavor) {
    case "sqlite":
      return v0_19sqliteMetaFactory(db.opts.sqlGestalt);
    default:
      throw ensureLogger(db.opts, "MetaStoreFactory").Error().Msg("unsupported db connection").AsError();
  }
}

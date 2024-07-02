import { ensureLogger } from "./ensurer";
import { DBConnection, DataSQLStore, MetaSQLStore, WalSQLStore } from "./types";

export async function WalStoreFactory(db: DBConnection): Promise<WalSQLStore> {
  switch (db.opts.sqlFlavor) {
    case "sqlite": {
      const { V0_18_0SQLiteWalStore } = await import("./v0.18.0/sqlite-wal-store.js");
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
      const { V0_18_0SQLiteDataStore } = await import("./v0.18.0/sqlite-data-store.js");
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
      const { V0_18_0SQLiteMetaStore } = await import("./v0.18.0/sqlite-meta-store.js");
      const store = new V0_18_0SQLiteMetaStore(db);
      return store;
    }
    default:
      throw ensureLogger(db.opts, "MetaStoreFactory").Error().Msg("unsupported db connection").AsError();
  }
}

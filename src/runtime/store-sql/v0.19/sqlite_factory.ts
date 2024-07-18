import { DataSQLStore, DBConnection, MetaSQLStore, SQLGestalt, SQLOpts, WalSQLStore } from "../types";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function v0_19sqliteWalFactory(gs: SQLGestalt): Promise<WalSQLStore> {
    throw new Error("Not implemented");
    //   const { V0_18_0SQLiteWalStore } = await import("./v0.19/better-sqlite3/sqlite-wal-store.js");
    //   const store = new V0_18_0SQLiteWalStore(db);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function v0_19sqliteDataFactory(gs: SQLGestalt): Promise<DataSQLStore> {
    throw new Error("Not implemented");
    //   const { V0_18_0SQLiteDataStore } = await import("./v0.19/better-sqlite3/sqlite-data-store.js");
    //   const store = new V0_18_0SQLiteDataStore(db);
    //   return store;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function v0_19sqliteMetaFactory(gs: SQLGestalt): Promise<MetaSQLStore> {
    throw new Error("Not implemented");
    //   const { V0_18_0SQLiteMetaStore } = await import("./v0.19/better-sqlite3/sqlite-meta-store.js");
    //   const store = new V0_18_0SQLiteMetaStore(db);
    //   return store;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function v0_19sqliteConnectionFactory(url: URL, opts: Partial<SQLOpts>): Promise<DBConnection> {
    throw new Error("Not implemented");
    //   const { V0_18_0SQLiteConnection } = await import("./v0.19/better-sqlite3/sqlite-connection.js");
    //   return new V0_18_0SQLiteConnection(url, opts);
}
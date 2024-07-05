import { Logger, ResolveOnce } from "@adviser/cement";

import type { AnyBlock, AnyLink, DbMeta } from "../../blockstore/index.js";
import { MetaStore, DataStore, RemoteWAL, WALState } from "../../blockstore/index.js";
import type { Loadable } from "../../blockstore/index.js";
import { format, parse, ToString } from "@ipld/dag-json";
import { SysContainer } from "../sys-container.js";
import { Falsy } from "../../types.js";
import { TestStore } from "../../blockstore/types.js";
import { SQLConnectionFactory } from "./sql-connection-factory.js";
import { DataSQLStore, MetaSQLStore, WalSQLStore } from "./types.js";
import { DataStoreFactory, MetaStoreFactory, WalStoreFactory, ensureSQLVersion } from "./store-version-factory.js";
import { ensureLogger } from "../../utils.js";

export class SQLRemoteWAL extends RemoteWAL {
  constructor(url: URL, loader: Loadable) {
    super(loader, ensureSQLVersion(url, loader.logger));
  }

  readonly onceWalStore = new ResolveOnce<WalSQLStore>();
  async ensureStore() {
    await SysContainer.start();
    return this.onceWalStore.once(async () => {
      const conn = SQLConnectionFactory(this.url);
      const ws = await WalStoreFactory(conn);
      await ws.start();
      return ws;
    });
  }

  async _load(branch = "main"): Promise<WALState | Falsy> {
    const ws = await this.ensureStore();
    const record = await ws.select({
      name: branch,
      branch: branch,
    });
    if (record.length === 0) return undefined;
    return record[0] && parse<WALState>(ws.dbConn.opts.textDecoder.decode(record[0].state).toString());
  }

  async _save(state: WALState, branch = "main"): Promise<void> {
    const encoded: ToString<WALState> = format(state);
    const ws = await this.ensureStore();
    await ws.insert({
      state: ws.dbConn.opts.textEncoder.encode(encoded),
      updated_at: new Date(),
      name: branch,
      branch: branch,
    });
  }
  async _close() {
    const ws = await this.ensureStore();
    await ws.close();
  }

  async _destroy() {
    const ws = await this.ensureStore();
    await ws.destroy();
  }
}

export class SQLMetaStore extends MetaStore {
  readonly tag: string = "header-sql";

  constructor(url: URL, name: string, ilogger: Logger) {
    const logger = ensureLogger(ilogger, "SQLMetaStore", { name, url });
    super(name, ensureSQLVersion(url, logger), logger);
  }

  readonly onceMetaStore = new ResolveOnce<MetaSQLStore>();
  async ensureStore() {
    await SysContainer.start();
    const conn = SQLConnectionFactory(this.url);
    return this.onceMetaStore.once(async () => {
      const ws = await MetaStoreFactory(conn);
      await ws.start();
      return ws;
    });
  }

  async load(branch = "main"): Promise<DbMeta[] | Falsy> {
    const ws = await this.ensureStore();
    const record = await ws.select({
      name: branch,
      branch: branch,
    });
    if (record.length === 0) {
      return undefined;
    }
    return record[0] && [this.parseHeader(ws.dbConn.opts.textDecoder.decode(record[0].meta))];
  }

  async save(meta: DbMeta, branch = "main") {
    const ws = await this.ensureStore();
    const bytes = this.makeHeader(meta);
    await ws.insert({
      meta: ws.dbConn.opts.textEncoder.encode(bytes),
      updated_at: new Date(),
      name: branch,
      branch: branch,
    });
    return undefined;
  }
  async close() {
    const ws = await this.ensureStore();
    await ws.close();
  }

  async destroy() {
    const ws = await this.ensureStore();
    await ws.destroy();
  }
}

export class SQLDataStore extends DataStore {
  readonly tag: string = "car-sql";

  readonly logger: Logger;
  constructor(url: URL, name: string, ilogger: Logger) {
    const logger = ensureLogger(ilogger, "SQLDataStore", { name, url })
    super(name, ensureSQLVersion(url, logger));
    this.logger = logger;
  }

  readonly onceDataStore = new ResolveOnce<DataSQLStore>();
  async ensureStore() {
    const conn = await SQLConnectionFactory(this.url);
    return this.onceDataStore.once(async () => {
      await SysContainer.start();
      const ws = await DataStoreFactory(conn);
      await ws.start();
      return ws;
    });
  }

  async save(car: AnyBlock): Promise<void> {
    const ws = await this.ensureStore();
    await ws.insert({
      name: this.name,
      car: car.cid.toString(),
      data: car.bytes,
      updated_at: new Date(),
    });
  }

  async load(cid: AnyLink): Promise<AnyBlock> {
    const ws = await this.ensureStore();
    const records = await ws.select(cid.toString());
    if (records.length === 0) {
      throw this.logger.Error().Str("cid", cid.toString()).Msg(`ENOENT: data missing idb block`).AsError();
    }
    return records[0] && { cid, bytes: records[0].data };
  }

  async remove(cid: AnyLink): Promise<void> {
    const ws = await this.ensureStore();
    await ws.delete(cid.toString());
  }
  async close() {
    const ws = await this.ensureStore();
    await ws.close();
  }
  async destroy() {
    const ws = await this.ensureStore();
    await ws.destroy();
    // throw new Error("Method not implemented.");
  }
}

export class SQLTestStore implements TestStore {
  readonly url: URL;
  readonly logger: Logger;
  constructor(url: URL, ilogger: Logger) {
    const logger = ensureLogger(ilogger, "SQLTestStore", { url });
    this.url = ensureSQLVersion(url, logger);
    this.logger = logger;
  }
  async get(key: string): Promise<Uint8Array> {
    const conn = SQLConnectionFactory(this.url);
    switch (this.url.searchParams.get("store")) {
      case "wal": {
        const sqlStore = await WalStoreFactory(conn);
        await sqlStore.start();
        const records = await sqlStore.select({
          name: key,
          branch: key,
        });
        return records[0].state;
      }
      case "meta": {
        const sqlStore = await MetaStoreFactory(conn);
        await sqlStore.start();
        const records = await sqlStore.select({
          name: key,
          branch: key,
        });
        return records[0].meta;
      }
      case "data": {
        const sqlStore = await DataStoreFactory(conn);
        await sqlStore.start();
        const records = await sqlStore.select(key);
        return records[0].data;
      }
      default:
        throw this.logger.Error().Str("key", key).Msg(`Method not implemented`);
    }
  }
}

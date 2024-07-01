import type { AnyBlock, AnyLink, DbMeta } from "../../storage-engine/index.js";
import { MetaStore, DataStore, RemoteWAL, WALState } from "../../storage-engine/index.js";
import type { Loadable } from "../../storage-engine/index.js";
import { format, parse, ToString } from "@ipld/dag-json";
import { SysContainer } from "./../sys-container.js";
import { Falsy } from "../../types.js";
import { ResolveOnce } from "../../storage-engine/resolve-once.js";
import { SQLiteWalStore, WalSQLStore, WalStoreFactory } from "./wal-type.js";
import { MetaSQLStore, MetaStoreFactory, SQLiteMetaStore } from "./meta-type.js";
import { DataSQLStore, DataStoreFactory, SQLiteDataStore } from "./data-type.js";
import { TestStore } from "../../storage-engine/types.js";
import { SQLFactory } from "./sql.js";

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

export class SQLRemoteWAL extends RemoteWAL {
  constructor(dir: URL, loader: Loadable) {
    super(loader, dir);
  }

  readonly onceWalStore = new ResolveOnce<WalSQLStore>();
  async ensureStore() {
    await SysContainer.start();
    const conn = SQLFactory(this.url);
    return this.onceWalStore.once(async () => {
      const ws = WalStoreFactory(conn);
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
    return record[0] && parse<WALState>(textDecoder.decode(record[0].state).toString());
  }

  async _save(state: WALState, branch = "main"): Promise<void> {
    const encoded: ToString<WALState> = format(state);
    const ws = await this.ensureStore();
    await ws.insert({
      state: textEncoder.encode(encoded),
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
    // throw new Error("Method not implemented.");
    const ws = await this.ensureStore();
    await ws.destroy();
  }
}

export class SQLMetaStore extends MetaStore {
  readonly tag: string = "header-sql";

  constructor(dir: URL, name: string) {
    super(name, dir);
  }

  readonly onceMetaStore = new ResolveOnce<MetaSQLStore>();
  async ensureStore() {
    await SysContainer.start();
    const conn = SQLFactory(this.url);
    return this.onceMetaStore.once(async () => {
      const ws = MetaStoreFactory(conn);
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
    return record[0] && [this.parseHeader(textDecoder.decode(record[0].meta))];
  }

  async save(meta: DbMeta, branch = "main") {
    const ws = await this.ensureStore();
    const bytes = this.makeHeader(meta);
    await ws.insert({
      meta: textEncoder.encode(bytes),
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

  constructor(url: URL, name: string) {
    super(name, url);
  }

  readonly onceDataStore = new ResolveOnce<DataSQLStore>();
  async ensureStore() {
    const conn = await SQLFactory(this.url);
    return this.onceDataStore.once(async () => {
      await SysContainer.start();
      const ws = DataStoreFactory(conn);
      await ws.start();
      return ws;
    });
  }

  async save(car: AnyBlock): Promise<void> {
    const ws = await this.ensureStore();
    console.log("DATA:save:pre:", car.cid.toString(), this.url.toString());
    await ws.insert({
      name: this.name,
      car: car.cid.toString(),
      data: car.bytes,
      updated_at: new Date(),
    });
  }

  async load(cid: AnyLink): Promise<AnyBlock> {
    const ws = await this.ensureStore();
    console.log("DATA:load:pre:", cid.toString());
    const records = await ws.select(cid.toString());
    console.log("DATA:load:post:", cid.toString(), records);
    if (records.length === 0) {
      console.log("DATA:load:post:exception:", cid.toString(), records);
      throw new Error(`ENOENT: data missing idb block ${cid.toString()}`);
    }
    return records[0] && { cid, bytes: records[0].data };
  }

  async remove(cid: AnyLink): Promise<void> {
    const ws = await this.ensureStore();
    console.log("DATA:remove:pre:", cid.toString());
    await ws.delete(cid.toString());
    console.log("DATA:remove:post:", cid.toString());
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
  constructor(readonly url: URL) {}
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async get(key: string): Promise<Uint8Array> {
    const conn = SQLFactory(this.url);
    switch (this.url.searchParams.get("store")) {
      case "wal": {
        const sqlStore = new SQLiteWalStore(conn);
        await sqlStore.start();
        const records = await sqlStore.select({
          name: key,
          branch: key,
        });
        return records[0].state;
      }
      case "meta": {
        const sqlStore = new SQLiteMetaStore(conn);
        await sqlStore.start();
        const records = await sqlStore.select({
          name: key,
          branch: key,
        });
        return records[0].meta;
      }
      case "data": {
        const sqlStore = new SQLiteDataStore(conn);
        await sqlStore.start();
        const records = await sqlStore.select(key);
        return records[0].data;
      }
      default:
        throw new Error(`Method not implemented.${this.url}:${key}`);
    }
  }
}

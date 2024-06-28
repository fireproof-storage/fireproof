import type { AnyBlock, AnyLink, DbMeta } from "../../storage-engine/index.js";
import { MetaStore, DataStore, RemoteWAL, WALState } from "../../storage-engine/index.js";
import type { Loadable } from "../../storage-engine/index.js";
import { format, parse, ToString } from "@ipld/dag-json";
import { SysContainer } from "./../sys-container.js";
import { Falsy } from "../../types.js";
import { SQLiteConnection } from "./sqlite-adapter-node.js";
import { ResolveOnce } from "../../storage-engine/resolve-once.js";
import { DBConnection } from "./types.js";
import { WalSQLStore, WalStoreFactory } from "./wal-type.js";
import { MetaSQLStore, MetaStoreFactory } from "./meta-type.js";
import { DataSQLStore, DataStoreFactory } from "./data-type.js";

const onceSQLConnections = new Map<string, ResolveOnce<DBConnection>>();

function connectSQL(url: URL) {
  console.log("connectSQL:1:", url.toString());
  const urlStr = url.toString();
  let ro = onceSQLConnections.get(urlStr);
  if (!ro) {
    ro = new ResolveOnce();
    onceSQLConnections.set(urlStr, ro);
  }
  console.log("connectSQL:2:", url.toString());
  return ro.once(async () => {
    console.log("connectSQL:3:", url.toString());
    const conn = SQLiteConnection.fromURL(url);
    console.log("connectSQL:4:", url.toString());
    await conn.connect();
    console.log("connectSQL:5:", url.toString());
    return conn;
  });
}

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

export class SQLRemoteWAL extends RemoteWAL {
  constructor(dir: URL, loader: Loadable) {
    super(loader, dir);
  }

  readonly onceWalStore = new ResolveOnce<WalSQLStore>();
  async ensureStore() {
    await SysContainer.start();
    const conn = await connectSQL(this.url);
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
    ws.close();
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
    const conn = await connectSQL(this.url);
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
    if (record.length === 0) return undefined;
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
    ws.close();
  }
}

export class SQLDataStore extends DataStore {
  readonly tag: string = "car-sql";

  constructor(dir: URL, name: string) {
    super(name, dir);
  }

  readonly onceDataStore = new ResolveOnce<DataSQLStore>();
  async ensureStore() {
    console.log("SQLDataStore:ensureStore:0:", this.url.toString());
    await SysContainer.start();
    console.log("SQLDataStore:ensureStore:1:", this.url.toString());
    const conn = await connectSQL(this.url);
    console.log("SQLDataStore:ensureStore:2:", this.url.toString());
    return this.onceDataStore.once(async () => {
      console.log("SQLDataStore:ensureStore:3:", this.url.toString());
      const ws = DataStoreFactory(conn);
      console.log("SQLDataStore:ensureStore:4:", this.url.toString());
      await ws.start();
      console.log("SQLDataStore:ensureStore:5:", this.url.toString());
      return ws;
    });
  }

  async save(car: AnyBlock): Promise<void> {
    console.log("SQLDataStore:save:", this.url.toString());
    const ws = await this.ensureStore();
    await ws.insert({
      name: this.name,
      car: car.cid.toString(),
      data: car.bytes,
      updated_at: new Date(),
    });
  }

  async load(cid: AnyLink): Promise<AnyBlock> {
    console.log("SQLDataStore:load:", this.url.toString());
    const ws = await this.ensureStore();
    const records = await ws.select(cid.toString());
    return records[0] && { cid, bytes: records[0].data };
  }

  async remove(cid: AnyLink): Promise<void> {
    const ws = await this.ensureStore();
    await ws.delete(cid.toString());
  }
  async close() {
    const ws = await this.ensureStore();
    ws.close();
  }
}

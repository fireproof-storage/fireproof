import type { Loadable, Loader } from '@fireproof/encrypted-blockstore/src/loader';
import { RemoteWAL as RemoteWALBase, WALState } from '@fireproof/encrypted-blockstore/src/remote-wal';
import { DataStore as DataStoreBase, MetaStore as MetaStoreBase } from '@fireproof/encrypted-blockstore/src/store';
import { AnyBlock, AnyLink, DbMeta } from '@fireproof/encrypted-blockstore/src/types';
import { format, parse, ToString } from '@ipld/dag-json';
import { MMKV } from 'react-native-mmkv';

export const makeDataStore = (name: string) => new DataStore(name);
export const makeMetaStore = (loader: Loader) => new MetaStore(loader.name);
export const makeRemoteWAL = (loader: Loadable) => new RemoteWAL(loader);

export class DataStore extends DataStoreBase {
  tag: string = 'car-native-mmkv';
  store: MMKV | null = null;

  async _withDB(dbWorkFun: (arg0: MMKV) => Promise<AnyBlock | void>) {
    if (!this.store) {
      const dbName = `fp.${this.STORAGE_VERSION}.${this.name}`;
      this.store = new MMKV({
        id: dbName,
      });
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return await dbWorkFun(this.store);
  }

  async load(cid: AnyLink): Promise<AnyBlock> {
    return (await this._withDB(async (db: MMKV) => {
      const bytes = db.getBuffer(cid.toString());
      if (!bytes) throw new Error(`missing db block ${cid.toString()}`);
      return { cid, bytes };
    })) as AnyBlock;
  }

  async save(car: AnyBlock): Promise<void> {
    return (await this._withDB(async (db: MMKV) => {
      db.set(car.cid.toString(), car.bytes);
    })) as void;
  }

  async remove(cid: AnyLink): Promise<void> {
    return (await this._withDB(async (db: MMKV) => {
      db.delete(cid.toString());
    })) as void;
  }
}

export class RemoteWAL extends RemoteWALBase {
  tag: string = 'wal-native-mmkv';
  store: MMKV | null = null;

  headerKey(branch: string) {
    // remove 'public' on next storage version bump
    return `fp.${this.STORAGE_VERSION}.wal.${this.loader.name}.${branch}`;
  }

  async _withDB(dbWorkFun: (arg0: MMKV) => Promise<WALState | null | void>) {
    if (!this.store) {
      const dbName = `fp.${this.STORAGE_VERSION}.wal`;
      this.store = new MMKV({
        id: dbName,
      });
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return await dbWorkFun(this.store);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async load(branch = 'main'): Promise<WALState | null> {
    return (await this._withDB(async (db: MMKV) => {
      const doc = db.getString(this.headerKey(branch));
      if (!doc) return null;
      return parse<WALState>(doc);
    })) as WALState | null;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async save(state: WALState, branch = 'main'): Promise<void> {
    return (await this._withDB(async (db: MMKV) => {
      const encoded: ToString<WALState> = format(state);
      db.set(this.headerKey(branch), encoded);
    })) as void;
  }
}

export class MetaStore extends MetaStoreBase {
  tag: string = 'header-native-mmkv';
  store: MMKV | null = null;

  headerKey(branch: string) {
    return `fp.${this.STORAGE_VERSION}.meta.${this.name}.${branch}`;
  }

  async _withDB(dbWorkFun: (arg0: MMKV) => Promise<DbMeta[] | null>) {
    if (!this.store) {
      const dbName = `fp.${this.STORAGE_VERSION}.meta`;
      this.store = new MMKV({
        id: dbName,
      });
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return await dbWorkFun(this.store);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async load(branch: string = 'main'): Promise<DbMeta[] | null> {
    return await this._withDB(async (db: MMKV) => {
      const doc = db.getString(this.headerKey(branch));
      if (!doc) return null;
      // TODO: react native wrt below?
      // browser assumes a single writer process
      // to support concurrent updates to the same database across multiple tabs
      // we need to implement the same kind of mvcc.crdt solution as in store-fs and connect-s3
      return [this.parseHeader(doc)];
    });
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async save(meta: DbMeta, branch: string = 'main') {
    return await this._withDB(async (db: MMKV) => {
      const headerKey = this.headerKey(branch);
      const bytes = this.makeHeader(meta);
      db.set(headerKey, bytes);
      return null;
    });
  }
}

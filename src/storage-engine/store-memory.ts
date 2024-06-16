/* eslint-disable import/first */
import { format, parse, ToString } from "@ipld/dag-json";
import { AnyBlock, AnyLink, DbMeta } from "./types";
import { DataStore as DataStoreBase, MetaStore as MetaStoreBase } from "./store";
import { RemoteWAL as RemoteWALBase, WALState } from "./remote-wal";

import type { Loadable, Loader } from "./loader";

export const makeDataStore = (name: string) => new DataStore(name);
export const makeMetaStore = (loader: Loader) => new MetaStore(loader.name);
export const makeRemoteWAL = (loader: Loadable) => new RemoteWAL(loader);

export class DataStore extends DataStoreBase {
  readonly tag: string = "car-mem";
  readonly store = new Map<string, Uint8Array>();

  async load(cid: AnyLink): Promise<AnyBlock> {
    const bytes = this.store.get(cid.toString());
    if (!bytes) throw new Error(`missing memory block ${cid.toString()}`);
    return { cid, bytes };
  }

  async save(car: AnyBlock): Promise<void> {
    this.store.set(car.cid.toString(), car.bytes);
  }

  async remove(cid: AnyLink): Promise<void> {
    this.store.delete(cid.toString());
  }
}

export class MetaStore extends MetaStoreBase {
  readonly tag: string = "header-mem";
  readonly store = new Map<string, string>();

  headerKey(branch: string) {
    return `fp.${this.STORAGE_VERSION}.meta.${this.name}.${branch}`;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async load(branch: string = "main"): Promise<DbMeta[] | null> {
    try {
      const bytesString = this.store.get(this.headerKey(branch));
      if (!bytesString) return null;
      // browser assumes a single writer process
      // to support concurrent updates to the same database across multiple tabs
      // we need to implement the same kind of mvcc.crdt solution as in store-fs and connect-s3
      return [this.parseHeader(bytesString)];
    } catch (e) {
      return null;
    }
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async save(meta: DbMeta, branch: string = "main") {
    try {
      const headerKey = this.headerKey(branch);
      const bytes = this.makeHeader(meta);
      this.store.set(headerKey, bytes);
      return null;
    } catch (e) {
      return null;
    }
  }
}

//
export class RemoteWAL extends RemoteWALBase {
  readonly tag: string = "wal-mem";
  readonly store = new Map<string, string>();

  headerKey(branch: string) {
    return `fp.${this.STORAGE_VERSION}.wal.${this.loader.name}.${branch}`;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async load(branch = "main"): Promise<WALState | null> {
    try {
      const bytesString = this.store.get(this.headerKey(branch));
      if (!bytesString) return null;
      return parse<WALState>(bytesString);
    } catch (e) {
      return null;
    }
  }
  // eslint-disable-next-line @typescript-eslint/require-await
  async save(state: WALState, branch = "main"): Promise<void> {
    try {
      const encoded: ToString<WALState> = format(state);
      this.store.set(this.headerKey(branch), encoded);
    } catch (e) {
      console.error("error saving wal", e);
      throw e;
    }
  }
}

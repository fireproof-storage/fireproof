import { format, parse, ToString } from "@ipld/dag-json";
import { AnyBlock, AnyLink, DbMeta } from "./types.js";
import { DataStore, MetaStore, RemoteWAL, WALState } from "./index.js";
import { ensureLogger } from "../utils.js";
import { Logger } from "@adviser/cement";

export class MemoryDataStore extends DataStore {
  readonly tag: string = "car-mem";
  readonly store = new Map<string, Uint8Array>();

  readonly logger: Logger;
  constructor(name: string, url: URL, logger: Logger) {
    super(name, url);
    this.logger = ensureLogger(logger, "MemoryDataStore", { name, url });
  }

  async load(cid: AnyLink): Promise<AnyBlock> {
    const bytes = this.store.get(cid.toString());
    if (!bytes) throw this.logger.Error().Str("cid", cid.toString()).Msg(`missing memory block`);
    return { cid, bytes };
  }

  async save(car: AnyBlock): Promise<void> {
    this.store.set(car.cid.toString(), car.bytes);
  }

  async remove(cid: AnyLink): Promise<void> {
    this.store.delete(cid.toString());
  }
  async close() {
    // no-op
  }
  async destroy() {
    // no-op
  }
}

export class MemoryMetaStore extends MetaStore {
  readonly STORAGE_VERSION: string = "do-not-use";
  readonly tag: string = "header-mem";
  readonly store = new Map<string, string>();

  headerKey(branch: string) {
    return `fp.${this.STORAGE_VERSION}.meta.${this.name}.${branch}`;
  }

  async load(branch = "main"): Promise<DbMeta[] | null> {
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

  async save(meta: DbMeta, branch = "main") {
    try {
      const headerKey = this.headerKey(branch);
      const bytes = this.makeHeader(meta);
      this.store.set(headerKey, bytes);
      return null;
    } catch (e) {
      return null;
    }
  }
  async close() {
    // no-op
  }
  async destroy() {
    // no-op
  }
}

//
export class MemoryRemoteWAL extends RemoteWAL {
  readonly STORAGE_VERSION: string = "do-not-use";
  readonly tag: string = "wal-mem";
  readonly store = new Map<string, string>();

  headerKey(branch: string) {
    return `fp.${this.STORAGE_VERSION}.wal.${this.loader.name}.${branch}`;
  }

  async _load(branch = "main"): Promise<WALState | null> {
    try {
      const bytesString = this.store.get(this.headerKey(branch));
      if (!bytesString) return null;
      return parse<WALState>(bytesString);
    } catch (e) {
      return null;
    }
  }
  async _save(state: WALState, branch = "main"): Promise<void> {
    try {
      const encoded: ToString<WALState> = format(state);
      this.store.set(this.headerKey(branch), encoded);
    } catch (e) {
      throw this.logger.Error().Any("error", e).Msg("error saving wal").AsError();
    }
  }
  async _close() {
    // no-op
  }
  async _destroy() {
    // no-op
  }
}

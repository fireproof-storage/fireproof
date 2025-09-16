import { BlockLog, Cars, CidSet, Peers } from "@fireproof/core-types-protocols-sync";
import { Logger, CoerceURI, URI } from "@adviser/cement";
import { Dexie, Table, TransactionMode } from "dexie";
import { SuperThis } from "@fireproof/core-types-base";
import { ensureLogger } from "@fireproof/core-runtime";

export class SyncDatabase {
  readonly sthis: SuperThis;
  readonly logger: Logger;
  db!: Dexie;
  // readonly blockLogs!: Table<BlockLog>;
  readonly url: URI;

  constructor(sthis: SuperThis, url: CoerceURI) {
    this.sthis = sthis;
    this.logger = ensureLogger(sthis, "SyncDatabase");
    this.url = URI.from(url);
  }

  transaction<T>(mode: TransactionMode, storeNames: string[], fn: () => Promise<T>): Promise<T> {
    return this.db.transaction(mode, storeNames, fn);
  }

  get blockLogs(): Table<BlockLog> {
    return (this.db as unknown as { blockLogs: Table<BlockLog> }).blockLogs;
  }

  get cidSets(): Table<CidSet> {
    return (this.db as unknown as { cidSets: Table<CidSet> }).cidSets;
  }

  get cars(): Table<Cars> {
    return (this.db as unknown as { cars: Table<Cars> }).cars;
  }

  get peers(): Table<Peers> {
    return (this.db as unknown as { peers: Table<Peers> }).peers;
  }

  async consumeStream<T>(stream: ReadableStream<T>, cb: (value: T) => void): Promise<void> {
    const reader = stream.getReader();
    async function readNext() {
      const { done, value } = await reader.read();
      if (done) return;
      cb(value);
      return readNext();
    }
    return readNext();
  }

  async close() {
    await this.db.close();
  }
  async destroy() {
    await this.db.delete({
      disableAutoOpen: true,
    });
  }

  async ready() {
    this.db = new Dexie("sync", {
      indexedDB: indexedDB,
      IDBKeyRange: IDBKeyRange,
    });
    this.db.version(1).stores({
      blockLogs: "seq, car, type",
      cidSets: "cid, peers, type",
      cars: "carCid, peers, type",
      peers: "peerId, type",
    });
    await this.db.open();
  }
}

import pLimit from "p-limit";
import { CarReader } from "@ipld/car/reader";
import { Logger, ResolveOnce } from "@adviser/cement";
// import { uuidv4 } from "uuidv7";

import {
  type AnyBlock,
  type AnyLink,
  type CarHeader,
  type CommitOpts,
  type TransactionMeta,
  type CarGroup,
  type CarLog,
  DataStore,
  type Loadable,
  BlockstoreRuntime,
  BlockstoreOpts,
  AttachedStores,
  ActiveStore,
  DataActiveStore,
} from "./types.js";

import { parseCarFile } from "./loader-helpers.js";

import { defaultedBlockstoreRuntime } from "./transaction.js";
import { CommitQueue } from "./commit-queue.js";
import type { Attachable, Attached, CarTransaction, DbMeta, Falsy, SuperThis } from "../types.js";
import { getKeyBag, KeyBag } from "../runtime/key-bag.js";
import { commit, commitFiles, CommitParams } from "./commitor.js";
import { decode } from "../runtime/wait-pr-multiformats/block.js";
import { sha256 as hasher } from "multiformats/hashes/sha2";
import { TaskManager } from "./task-manager.js";
import { AttachedRemotesImpl, createAttachedStores } from "./attachable-store.js";
import { isNotFoundError } from "../utils.js";

export function carLogIncludesGroup(list: CarLog, cids: CarGroup) {
  return list.some((arr: CarGroup) => {
    return arr.toString() === cids.toString();
  });
}

// this works for car groups because toString looks like bafy,bafy
function uniqueCids(list: CarLog, remove = new Set<string>()): CarLog {
  const byString = new Map<string, CarGroup>();
  for (const cid of list) {
    if (remove.has(cid.toString())) continue;
    byString.set(cid.toString(), cid);
  }
  return [...byString.values()];
}

// export interface DecoderAndCarReader extends CarReader {
//   readonly decoder: BlockDecoder<number, Uint8Array>;
// }

export class Loader implements Loadable {
  // readonly name: string;
  readonly ebOpts: BlockstoreRuntime;
  readonly commitQueue: CommitQueue<CarGroup> = new CommitQueue<CarGroup>();
  readonly isCompacting = false;
  readonly carReaders: Map<string, Promise<CarReader>> = new Map<string, Promise<CarReader>>();
  readonly seenCompacted: Set<string> = new Set<string>();
  readonly processedCars: Set<string> = new Set<string>();
  readonly sthis: SuperThis;
  readonly taskManager: TaskManager;

  carLog: CarLog = [];
  // key?: string;
  // keyId?: string;
  // remoteMetaStore?: MetaStore;
  // remoteCarStore?: DataStore;
  // remoteFileStore?: DataStore;

  readonly attachedStores: AttachedStores;

  attach(attached: Attachable): Promise<Attached> {
    return this.attachedStores.attach(attached);
  }

  private getBlockCache = new Map<string, AnyBlock>();
  private seenMeta = new Set<string>();
  private writeLimit = pLimit(1);

  // private readonly _carStore = new ResolveOnce<DataStore>();
  // async carStore(): Promise<DataStore> {
  //   return this._carStore.once(async () =>
  //     this.ebOpts.storeRuntime.makeDataStore({
  //       // sthis: this.sthis,
  //       gatewayInterceptor: this.ebOpts.gatewayInterceptor,
  //       url: this.ebOpts.storeUrls.data,
  //       // keybag: await this.keyBag(),
  //       loader: this,
  //     }),
  //   );
  // }

  // private readonly _fileStore = new ResolveOnce<DataStore>();
  // async fileStore(): Promise<DataStore> {
  //   return this._fileStore.once(async () =>
  //     this.ebOpts.storeRuntime.makeDataStore({
  //       // sthis: this.sthis,
  //       gatewayInterceptor: this.ebOpts.gatewayInterceptor,
  //       url: this.ebOpts.storeUrls.file,
  //       // keybag: await this.keyBag(),
  //       loader: this,
  //     }),
  //   );
  // }
  // private readonly _WALStore = new ResolveOnce<WALStore>();
  // async WALStore(): Promise<WALStore> {
  //   return this._WALStore.once(async () =>
  //     this.ebOpts.storeRuntime.makeWALStore({
  //       // sthis: this.sthis,
  //       gatewayInterceptor: this.ebOpts.gatewayInterceptor,
  //       url: this.ebOpts.storeUrls.wal,
  //       // keybag: await this.keyBag(),
  //       loader: this,
  //     }),
  //   );
  // }

  // private readonly _metaStore = new ResolveOnce<MetaStore>();
  // async metaStore(): Promise<MetaStore> {
  //   return this._metaStore.once(async () =>
  //     this.ebOpts.storeRuntime.makeMetaStore({
  //       // sthis: this.sthis,
  //       gatewayInterceptor: this.ebOpts.gatewayInterceptor,
  //       url: this.ebOpts.storeUrls.meta,
  //       // keybag: await this.keyBag(),
  //       loader: this,
  //     }),
  //   );
  // }

  keyBag(): Promise<KeyBag> {
    return getKeyBag(this.sthis, this.ebOpts.keyBag);
  }

  private readonly onceReady: ResolveOnce<void> = new ResolveOnce<void>();
  async ready(): Promise<void> {
    return this.onceReady.once(async () => {
      await createAttachedStores(
        {
          car: { url: this.ebOpts.storeUrls.car, gatewayInterceptor: this.ebOpts.gatewayInterceptor },
          file: { url: this.ebOpts.storeUrls.file, gatewayInterceptor: this.ebOpts.gatewayInterceptor },
          meta: { url: this.ebOpts.storeUrls.meta, gatewayInterceptor: this.ebOpts.gatewayInterceptor },
          wal: { url: this.ebOpts.storeUrls.wal, gatewayInterceptor: this.ebOpts.gatewayInterceptor },
        },
        this.attachedStores,
      );
      const local = this.attachedStores.local();
      const metas = await local.active.meta.load();
      if (this.ebOpts.meta) {
        await this.handleDbMetasFromStore([this.ebOpts.meta, ...(metas || [])], local);
      } else if (metas) {
        await this.handleDbMetasFromStore(metas, local);
      }
    });
  }

  async close() {
    await this.commitQueue.waitIdle();
    await this.attachedStores.detach();
    // const toClose = await Promise.all([this.carStore(), this.metaStore(), this.fileStore(), this.WALStore()]);
    // await Promise.all(toClose.map((store) => store.close()));
  }

  async destroy() {
    await Promise.all(
      this.attachedStores
        .local()
        .baseStores()
        .map((store) => store.destroy()),
    );
  }

  readonly logger: Logger;
  constructor(sthis: SuperThis, ebOpts: BlockstoreOpts) {
    // this.name = name;
    // console.log("Loader", name, ebOpts)
    this.sthis = sthis;
    this.ebOpts = defaultedBlockstoreRuntime(
      sthis,
      {
        ...ebOpts,
        // name,
      },
      "Loader",
    );
    this.logger = this.ebOpts.logger;
    this.taskManager = new TaskManager(sthis, async (dbMeta: DbMeta, activeStore: ActiveStore) => {
      await this.handleDbMetasFromStore([dbMeta], activeStore);
    });
    this.attachedStores = new AttachedRemotesImpl(this);
  }

  // async snapToCar(carCid: AnyLink | string) {
  //   await this.ready
  //   if (typeof carCid === 'string') {
  //     carCid = CID.parse(carCid)
  //   }
  //   const carHeader = await this.loadCarHeaderFromMeta({ car: carCid, key: this.key || null })
  //   this.carLog = [carCid, ...carHeader.cars]
  //   await this.getMoreReaders(carHeader.cars)
  //   await this._applyCarHeader(carHeader, true)
  // }

  async handleDbMetasFromStore(metas: DbMeta[], activeStore: ActiveStore): Promise<void> {
    this.logger.Debug().Any("metas", metas).Msg("handleDbMetasFromStore");
    for (const meta of metas) {
      await this.writeLimit(async () => {
        await this.mergeDbMetaIntoClock(meta, activeStore);
      });
    }
  }

  async mergeDbMetaIntoClock(meta: DbMeta, activeStore: ActiveStore): Promise<void> {
    if (this.isCompacting) {
      throw this.logger.Error().Msg("cannot merge while compacting").AsError();
    }
    // this could be abit more compact
    if (this.seenMeta.has(meta.cars.toString())) return;
    this.seenMeta.add(meta.cars.toString());

    // if (meta.key) {
    //   await this.setKey(meta.key);
    // }
    if (carLogIncludesGroup(this.carLog, meta.cars)) {
      return;
    }
    const carHeader = await this.loadCarHeaderFromMeta<TransactionMeta>(meta, activeStore);
    // fetch other cars down the compact log?
    // todo we should use a CID set for the compacted cids (how to expire?)
    // console.log('merge carHeader', carHeader.head.length, carHeader.head.toString(), meta.car.toString())
    carHeader.compact.map((c) => c.toString()).forEach(this.seenCompacted.add, this.seenCompacted);
    await this.getMoreReaders(carHeader.cars.flat(), activeStore);
    this.carLog = [...uniqueCids([meta.cars, ...this.carLog, ...carHeader.cars], this.seenCompacted)];
    await this.ebOpts.applyMeta?.(carHeader.meta);
  }

  // protected async ingestKeyFromMeta(meta: DbMeta): Promise<void> {
  //   const { key } = meta;
  //   if (key) {
  //     await this.setKey(key);
  //   }
  // }

  async loadCarHeaderFromMeta<T>(dbm: DbMeta, astore: ActiveStore): Promise<CarHeader<T>> {
    //Call loadCar for every cid
    const reader = await this.loadCar(dbm.cars[0], astore);
    return await parseCarFile(reader, this.logger);
  }

  // async _getKey(): Promise<string | undefined> {
  //   if (this.key) return this.key;
  //   // generate a random key
  //   if (!this.ebOpts.public) {
  //     await this.setKey(toHexString(this.ebOpts.crypto.randomBytes(32)));
  //   }
  //   return this.key || undefined;
  // }

  async commitFiles(
    t: CarTransaction,
    done: TransactionMeta,
    // opts: CommitOpts = { noLoader: false, compact: false },
  ): Promise<CarGroup> {
    await this.ready();
    const fstore = this.attachedStores.local().active.file;
    const wstore = this.attachedStores.local().active.wal;
    return this.commitQueue.enqueue(() => commitFiles(fstore, wstore, t, done));
  }

  async loadFileCar(cid: AnyLink /*, isPublic = false*/, store: ActiveStore): Promise<CarReader> {
    return await this.storesLoadCar(cid, store.fileStore()); // store.local.file, store.remotes.map((r) => r.file));
  }

  async commit<T = TransactionMeta>(
    t: CarTransaction,
    done: T,
    opts: CommitOpts = { noLoader: false, compact: false },
  ): Promise<CarGroup> {
    await this.ready();
    const carStore = await this.attachedStores.local().active.car;
    const params: CommitParams = {
      encoder: (await carStore.keyedCrypto()).codec(),
      carLog: this.carLog,
      carStore: carStore,
      WALStore: await this.attachedStores.local().active.wal,
      metaStore: await this.attachedStores.local().active.meta,
      threshold: this.ebOpts.threshold,
    };
    return this.commitQueue.enqueue(async () => {
      await this.cacheTransaction(t);
      const ret = await commit(params, t, done, opts);
      await this.updateCarLog(ret.cgrp, ret.header, !!opts.compact);
      return ret.cgrp;
    });
  }

  async updateCarLog<T>(cids: CarGroup, fp: CarHeader<T>, compact: boolean): Promise<void> {
    if (compact) {
      const previousCompactCid = fp.compact[fp.compact.length - 1];
      fp.compact.map((c) => c.toString()).forEach(this.seenCompacted.add, this.seenCompacted);
      this.carLog = [...uniqueCids([...this.carLog, ...fp.cars, cids], this.seenCompacted)];
      await this.removeCidsForCompact(previousCompactCid[0], this.attachedStores.local()).catch((e) => e);
    } else {
      this.carLog.unshift(cids);
    }
  }

  async cacheTransaction(t: CarTransaction) {
    for await (const block of t.entries()) {
      const sBlock = block.cid.toString();
      if (!this.getBlockCache.has(sBlock)) {
        this.getBlockCache.set(sBlock, block);
      }
    }
  }

  async cacheCarReader(carCidStr: string, reader: CarReader) {
    if (this.processedCars.has(carCidStr)) return;
    this.processedCars.add(carCidStr);
    for await (const block of reader.blocks()) {
      const sBlock = block.cid.toString();
      if (!this.getBlockCache.has(sBlock)) {
        this.getBlockCache.set(sBlock, block);
      }
    }
  }

  async removeCidsForCompact(cid: AnyLink, store: ActiveStore) {
    const carHeader = await this.loadCarHeaderFromMeta(
      {
        cars: [cid],
      },
      store,
    );
    for (const cids of carHeader.compact) {
      for (const cid of cids) {
        await this.attachedStores.local().active.car.remove(cid);
      }
    }
  }

  // async flushCars() {
  //   await this.ready
  //   // for each cid in car log, make a dbMeta
  //   for (const cid of this.carLog) {
  //     const dbMeta = { car: cid, key: this.key || null } as DbMeta
  //     await this.remoteWAL!.enqueue(dbMeta, { public: false })
  //   }
  // }

  async *entries(cache = true): AsyncIterableIterator<AnyBlock> {
    await this.ready();
    if (cache) {
      for (const [, block] of this.getBlockCache) {
        yield block;
      }
    } else {
      for (const [, block] of this.getBlockCache) {
        yield block;
      }
      for (const cids of this.carLog) {
        for (const cid of cids) {
          const reader = await this.loadCar(cid, this.attachedStores.local());
          if (!reader) throw this.logger.Error().Ref("cid", cid).Msg("missing car reader").AsError();
          for await (const block of reader.blocks()) {
            const sCid = block.cid.toString();
            if (!this.getBlockCache.has(sCid)) {
              yield block;
            }
          }
        }
      }
    }
  }

  async getBlock(cid: AnyLink, store: ActiveStore): Promise<AnyBlock | Falsy> {
    await this.ready();
    const sCid = cid.toString();
    if (this.getBlockCache.has(sCid)) return this.getBlockCache.get(sCid);

    const getCarCid = async (carCid: AnyLink) => {
      if (this.getBlockCache.has(sCid)) return this.getBlockCache.get(sCid);
      const reader = await this.loadCar(carCid, store);
      if (!reader) {
        throw this.logger.Error().Ref("cid", carCid).Msg("missing car reader").AsError();
      }
      await this.cacheCarReader(carCid.toString(), reader).catch(() => {
        return;
      });
      if (this.getBlockCache.has(sCid)) return this.getBlockCache.get(sCid);
      throw this.logger.Error().Str("cid", sCid).Msg("block not in reader").AsError();
    };

    const getCompactCarCids = async (carCid: AnyLink) => {
      // console.log("getCompactCarCids", carCid.toString())

      const reader = await this.loadCar(carCid, store);
      if (!reader) {
        throw this.logger.Error().Str("cid", carCid.toString()).Msg("missing car reader").AsError();
      }

      const header = await parseCarFile(reader, this.logger);

      const compacts = header.compact;

      let got: AnyBlock | undefined;
      const batchSize = 5;
      for (let i = 0; i < compacts.length; i += batchSize) {
        const promises: Promise<AnyBlock | undefined>[] = [];
        for (let j = i; j < Math.min(i + batchSize, compacts.length); j++) {
          for (const cid of compacts[j]) {
            promises.push(getCarCid(cid));
          }
        }
        try {
          got = await Promise.any(promises);
        } catch {
          // Ignore the error and continue with the next iteration
        }
        if (got) break;
      }

      if (this.getBlockCache.has(sCid)) return this.getBlockCache.get(sCid);
      throw this.logger.Error().Str("cid", sCid).Msg("block not in compact reader").AsError();
    };

    let got;
    const batchSize = 5;
    for (let i = 0; i < this.carLog.length; i += batchSize) {
      const batch = this.carLog.slice(i, i + batchSize);
      const promises: Promise<AnyBlock | undefined>[] = batch.flatMap((slice) => slice.map(getCarCid));
      try {
        got = await Promise.any(promises);
      } catch {
        // Ignore the error and continue with the next iteration
      }
      if (got) break;
    }

    if (!got) {
      try {
        got = await getCompactCarCids(this.carLog[this.carLog.length - 1][0]);
      } catch {
        // Ignore the error and continue with the next iteration
      }
    }

    return got;
  }

  async loadCar(cid: AnyLink, store: ActiveStore): Promise<CarReader> {
    // if (!this.carStore) {
    //   throw this.logger.Error().Msg("car store not initialized").AsError();
    // }
    const loaded = await this.storesLoadCar(cid, store.carStore());
    return loaded;
  }

  async makeDecoderAndCarReader(cid: AnyLink, store: DataActiveStore): Promise<CarReader> {
    const cidsString = cid.toString();
    let loadedCar: AnyBlock | undefined = undefined;
    let activeStore: DataStore = store.attached.local();
    try {
      //loadedCar now is an array of AnyBlocks
      this.logger.Debug().Any("cid", cidsString).Msg("loading car");
      loadedCar = await store.attached.local().load(cid);
      this.logger.Debug().Bool("loadedCar", loadedCar).Msg("loaded");
    } catch (e) {
      if (!isNotFoundError(e)) {
        throw this.logger.Error().Str("cid", cidsString).Err(e).Msg("loading car");
      }
      for (const remote of store.attached.remotes()) {
        const remoteCar = await remote.load(cid);
        if (remoteCar) {
          // todo test for this
          this.logger.Debug().Ref("cid", remoteCar.cid).Msg("saving remote car locally");
          await store.attached.local().save(remoteCar);
          loadedCar = remoteCar;
          activeStore = remote;
          break;
        } else {
          this.logger.Error().Str("cid", cidsString).Err(e).Msg("loading car");
        }
      }
    }
    if (!loadedCar) {
      throw this.logger.Error().Url(store.attached.local().url()).Str("cid", cidsString).Msg("missing car files").AsError();
    }
    //This needs a fix as well as the fromBytes function expects a Uint8Array
    //Either we can merge the bytes or return an array of rawReaders
    const bytes = await decode({ bytes: loadedCar.bytes, hasher, codec: (await activeStore.keyedCrypto()).codec() }); // as Uint8Array,
    const rawReader = await CarReader.fromBytes(bytes.value);
    const readerP = Promise.resolve(rawReader);
    // const kc = await activeStore.keyedCrypto()
    // const readerP = !kc.isEncrypting ? Promise.resolve(rawReader) : this.ensureDecryptedReader(activeStore, rawReader);

    const cachedReaderP = readerP.then(async (reader) => {
      await this.cacheCarReader(cidsString, reader).catch((e) => {
        this.logger.Error().Err(e).Str("cid", cidsString).Msg("error caching car reader");
        return;
      });
      return reader;
    });
    this.carReaders.set(cidsString, cachedReaderP);
    return readerP;
  }

  //What if instead it returns an Array of CarHeader
  protected async storesLoadCar(cid: AnyLink, store: DataActiveStore): Promise<CarReader> {
    const cidsString = cid.toString();
    let dacr = this.carReaders.get(cidsString);
    if (!dacr) {
      dacr = this.makeDecoderAndCarReader(cid, store);
      this.carReaders.set(cidsString, dacr);
    }
    return dacr;
  }

  protected async getMoreReaders(cids: AnyLink[], store: ActiveStore) {
    const limit = pLimit(5);
    const missing = cids.filter((cid) => !this.carReaders.has(cid.toString()));
    await Promise.all(missing.map((cid) => limit(() => this.loadCar(cid, store))));
  }
}

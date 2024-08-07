// import pLimit from "p-limit";
import { CarReader } from "@ipld/car";
import { Logger, ResolveOnce } from "@adviser/cement";
// import { uuidv4 } from "uuidv7";

import {
  type AnyBlock,
  type AnyLink,
  type CarHeader,
  type CommitOpts,
  type DbMeta,
  type TransactionMeta,
  type CarGroup,
  type CarLog,
  DataStore,
  WALStore,
  // RemoteMetaStore,
  MetaStore,
  BaseStore,
  type Loadable,
  BlockstoreRuntime,
  BlockstoreOpts,
} from "./types.js";

import { parseCarFile } from "./loader-helpers.js";

import { CarTransaction, defaultedBlockstoreRuntime } from "./transaction.js";
import { CommitQueue } from "./commit-queue.js";
import type { Falsy, SuperThis } from "../types.js";
import { getKeyBag } from "../runtime/key-bag.js";
import { commit, commitFiles, CommitParams } from "./commitor.js";
import { decode } from "../runtime/wait-pr-multiformats/block.js";
import { sha256 as hasher } from "multiformats/hashes/sha2";
import { ensureLogger } from "../utils.js";

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
  readonly name: string;
  readonly ebOpts: BlockstoreRuntime;
  readonly commitQueue: CommitQueue<CarGroup> = new CommitQueue<CarGroup>();
  readonly isCompacting = false;
  readonly carReaders = new Map<string, Promise<CarReader>>();
  readonly seenCompacted = new Set<string>();
  readonly processedCars = new Set<string>();
  readonly sthis: SuperThis;

  carLog: CarLog = [];
  // key?: string;
  // keyId?: string;
  // remoteMetaStore?: RemoteMetaStore;
  remoteCarStore?: DataStore;
  remoteFileStore?: DataStore;

  private getBlockCache = new Map<string, AnyBlock>();
  private seenMeta = new Set<string>();
  // private writeLimit = pLimit(1);

  // readonly id = uuidv4();

  async keyBag() {
    return getKeyBag(this.sthis, this.ebOpts.keyBag);
  }

  async carStore(): Promise<DataStore> {
    return this.ebOpts.storeRuntime.makeDataStore(this);
  }

  async fileStore(): Promise<DataStore> {
    return this.ebOpts.storeRuntime.makeDataStore(this);
  }
  async WALStore(): Promise<WALStore> {
    return this.ebOpts.storeRuntime.makeWALStore(this);
  }

  async metaStore(): Promise<MetaStore> {
    return this.ebOpts.storeRuntime.makeMetaStore(this);
  }

  readonly onceReady = new ResolveOnce<void>();
  async ready(): Promise<void> {
    return this.onceReady.once(async () => {
      const metas = this.ebOpts.meta ? [this.ebOpts.meta] : await (await this.metaStore()).load("main");
      if (metas) {
        await this.handleDbMetasFromStore(metas);
      }
    });
  }

  async close() {
    const toClose = await Promise.all([this.carStore(), this.metaStore(), this.fileStore(), this.WALStore()]);
    await Promise.all(toClose.map((store) => store.close()));
  }

  async destroy() {
    const toDestroy = await Promise.all([this.carStore(), this.metaStore(), this.fileStore(), this.WALStore()]);
    await Promise.all(toDestroy.map((store) => store.destroy()));
  }

  readonly logger: Logger;
  constructor(name: string, ebOpts: BlockstoreOpts, sthis: SuperThis) {
    this.name = name;
    // console.log("Loader", name, ebOpts)
    this.sthis = sthis;
    this.ebOpts = defaultedBlockstoreRuntime(
      sthis,
      {
        ...ebOpts,
        name,
      },
      "Loader",
    );
    this.logger = this.ebOpts.logger;
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

  async handleDbMetasFromStore(metas: DbMeta[]): Promise<void> {
    const logger = ensureLogger(this.sthis, "handleDbMetasFromStore", {
      id: Math.random().toString(36).substring(7),
    });
    logger.Debug().Any("metas", metas).Msg("handleDbMetasFromStore");
    for (const meta of metas) {
      logger.Debug().Any("meta", meta).Msg("handleDbMetasFromStore-1");
      // await this.writeLimit(async () => {
      // logger.Debug().Any("meta", meta).Msg("handleDbMetasFromStore-2");
      await this.mergeDbMetaIntoClock(meta, logger);
      // logger.Debug().Any("meta", meta).Msg("handleDbMetasFromStore-3");
      // });
      logger.Debug().Any("meta", meta).Msg("handleDbMetasFromStore-4");
    }
  }

  async mergeDbMetaIntoClock(meta: DbMeta, logger: Logger): Promise<void> {
    logger.Debug().Any("meta", meta).Msg("mergeDbMetaIntoClock-1");
    if (this.isCompacting) {
      throw logger.Error().Msg("cannot merge while compacting").AsError();
    }

    logger.Debug().Any("meta", meta).Msg("mergeDbMetaIntoClock-2");
    if (this.seenMeta.has(meta.cars.toString())) return;
    this.seenMeta.add(meta.cars.toString());
    logger.Debug().Any("meta", meta).Msg("mergeDbMetaIntoClock-3");

    // if (meta.key) {
    //   await this.setKey(meta.key);
    // }
    if (carLogIncludesGroup(this.carLog, meta.cars)) {
      logger.Debug().Any("meta", meta).Msg("mergeDbMetaIntoClock-3.1");
      return;
    }
    logger.Debug().Any("meta", meta).Msg("mergeDbMetaIntoClock-4");
    const carHeader = await this.loadCarHeaderFromMeta<TransactionMeta>(meta);
    logger.Debug().Any("meta", meta).Msg("mergeDbMetaIntoClock-5");
    // fetch other cars down the compact log?
    // todo we should use a CID set for the compacted cids (how to expire?)
    // console.log('merge carHeader', carHeader.head.length, carHeader.head.toString(), meta.car.toString())
    carHeader.compact.map((c) => c.toString()).forEach(this.seenCompacted.add, this.seenCompacted);
    logger.Debug().Any("meta", meta).Msg("mergeDbMetaIntoClock-6");
    await this.getMoreReaders(carHeader.cars.flat(), logger);
    logger.Debug().Any("meta", meta).Msg("mergeDbMetaIntoClock-7");
    this.carLog = [...uniqueCids([meta.cars, ...this.carLog, ...carHeader.cars], this.seenCompacted)];
    logger.Debug().Any("meta", meta).Msg("mergeDbMetaIntoClock-8");
    await this.ebOpts.applyMeta?.(carHeader.meta);
    logger.Debug().Any("meta", meta).Msg("mergeDbMetaIntoClock-9");
  }

  // protected async ingestKeyFromMeta(meta: DbMeta): Promise<void> {
  //   const { key } = meta;
  //   if (key) {
  //     await this.setKey(key);
  //   }
  // }

  async loadCarHeaderFromMeta<T>({ cars: cids }: DbMeta): Promise<CarHeader<T>> {
    //Call loadCar for every cid
    const reader = await this.loadCar(cids[0]);
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
    const fstore = await this.fileStore();
    const wstore = await this.WALStore();
    return this.commitQueue.enqueue(() => commitFiles(fstore, wstore, t, done));
  }

  async loadFileCar(cid: AnyLink /*, isPublic = false*/): Promise<CarReader> {
    return await this.storesLoadCar(cid, await this.fileStore(), this.remoteFileStore);
  }

  async commit<T = TransactionMeta>(
    t: CarTransaction,
    done: T,
    opts: CommitOpts = { noLoader: false, compact: false },
  ): Promise<CarGroup> {
    this.logger.Debug().Msg("commit-0");
    await this.ready();
    this.logger.Debug().Msg("commit-1");
    const fstore = await this.fileStore();
    const encoder = (await fstore.keyedCrypto()).codec();
    const WALStore = await this.WALStore();
    const metaStore = await this.metaStore();
    const params: CommitParams = {
      // encoder: (await fstore.keyedCrypto()).codec(),
      encoder,
      carLog: this.carLog,
      carStore: fstore,
      // WALStore: await this.WALStore(),
      // metaStore: await this.metaStore(),
      WALStore,
      metaStore,
    };
    this.logger.Debug().Msg("commit-3");
    const ret = this.commitQueue.enqueue(async () => {
      this.logger.Debug().Msg("commit-3.1");
      await this.cacheTransaction(t);
      this.logger.Debug().Msg("commit-3.2");
      const ret = await commit(params, t, done, opts);
      this.logger.Debug().Msg("commit-3.3");
      await this.updateCarLog(ret.cgrp, ret.header, !!opts.compact);
      this.logger.Debug().Msg("commit-3.4");
      return ret.cgrp;
    });
    this.logger.Debug().Msg("commit-4");
    return ret;
  }

  async updateCarLog<T>(cids: CarGroup, fp: CarHeader<T>, compact: boolean): Promise<void> {
    if (compact) {
      const previousCompactCid = fp.compact[fp.compact.length - 1];
      fp.compact.map((c) => c.toString()).forEach(this.seenCompacted.add, this.seenCompacted);
      this.carLog = [...uniqueCids([...this.carLog, ...fp.cars, cids], this.seenCompacted)];
      await this.removeCidsForCompact(previousCompactCid[0]).catch((e) => e);
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

  async removeCidsForCompact(cid: AnyLink) {
    const carHeader = await this.loadCarHeaderFromMeta({
      cars: [cid],
    } as unknown as DbMeta);
    for (const cids of carHeader.compact) {
      for (const cid of cids) {
        await (await this.carStore()).remove(cid);
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
          const reader = await this.loadCar(cid);
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

  async getBlock(cid: AnyLink): Promise<AnyBlock | Falsy> {
    await this.ready();
    const sCid = cid.toString();
    if (this.getBlockCache.has(sCid)) return this.getBlockCache.get(sCid);

    const getCarCid = async (carCid: AnyLink) => {
      if (this.getBlockCache.has(sCid)) return this.getBlockCache.get(sCid);
      const reader = await this.loadCar(carCid);
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

      const reader = await this.loadCar(carCid);
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

  async loadCar(cid: AnyLink): Promise<CarReader> {
    if (!this.carStore) {
      throw this.logger.Error().Msg("car store not initialized").AsError();
    }
    const carStore = await this.carStore();
    this.logger
      .Debug()
      .Str("cid", cid.toString())
      .Url(carStore.url(), "local")
      .Url(this.remoteCarStore?.url() || "remote://", "remote")
      .Msg("load car");
    const loaded = await this.storesLoadCar(cid, carStore, this.remoteCarStore);
    return loaded;
  }

  async makeDecoderAndCarReader(cid: AnyLink, local: DataStore, remote?: DataStore) {
    const cidsString = cid.toString();
    let loadedCar: AnyBlock | undefined = undefined;
    let activeStore: BaseStore = local;
    try {
      //loadedCar now is an array of AnyBlocks
      this.logger
        .Debug()
        .Url(remote?.url() || "")
        .Url(local.url())
        .Str("cid", cidsString)
        .Msg("loading car");
      loadedCar = await local.load(cid);
      this.logger.Debug().Bool("loadedCar", loadedCar).Msg("loaded");
    } catch (e) {
      if (remote) {
        const remoteCar = await remote.load(cid);
        if (remoteCar) {
          // todo test for this
          this.logger.Debug().Ref("cid", remoteCar.cid).Msg("saving remote car locally");
          await local.save(remoteCar);
          loadedCar = remoteCar;
          activeStore = remote;
        }
      } else {
        this.logger.Error().Str("cid", cidsString).Err(e).Msg("loading car");
      }
    }
    if (!loadedCar) {
      throw this.logger.Error().Url(local.url()).Str("cid", cidsString).Msg("missing car files").AsError();
    }
    this.logger.Debug().Str("cid", cidsString).Len(loadedCar.bytes).Msg("loading car-1");
    //This needs a fix as well as the fromBytes function expects a Uint8Array
    //Either we can merge the bytes or return an array of rawReaders
    const codec = (await activeStore.keyedCrypto()).codec();
    this.logger.Debug().Str("cid", cidsString).Msg("loading car-1.5");
    const bytes = await decode({ bytes: loadedCar.bytes, hasher, codec }); // as Uint8Array,
    this.logger.Debug().Str("cid", cidsString).Msg("loading car-2");
    const rawReader = await CarReader.fromBytes(bytes.value);
    this.logger.Debug().Str("cid", cidsString).Msg("loading car-3");
    const readerP = Promise.resolve(rawReader);
    this.logger.Debug().Str("cid", cidsString).Msg("loading car-4");
    // const kc = await activeStore.keyedCrypto()
    // const readerP = !kc.isEncrypting ? Promise.resolve(rawReader) : this.ensureDecryptedReader(activeStore, rawReader);

    const cachedReaderP = readerP.then(async (reader) => {
      this.logger.Debug().Msg("caching car reader-pre");
      await this.cacheCarReader(cidsString, reader).catch((e) => {
        this.logger.Error().Err(e).Str("cid", cidsString).Msg("error caching car reader");
        return;
      });
      this.logger.Debug().Msg("caching car reader-post");
      return reader;
    });
    this.carReaders.set(cidsString, cachedReaderP);
    this.logger.Debug().Msg("exit reader");
    return readerP;
  }

  //What if instead it returns an Array of CarHeader
  protected async storesLoadCar(cid: AnyLink, local: DataStore, remote?: DataStore): Promise<CarReader> {
    const cidsString = cid.toString();
    let dacr = this.carReaders.get(cidsString);
    this.logger.Debug().Str("cid", cidsString).Bool("dacr", dacr).Msg("storesLoadCar");
    if (!dacr) {
      dacr = this.makeDecoderAndCarReader(cid, local, remote);
      this.carReaders.set(cidsString, dacr);
    }
    return dacr;
  }

  protected async getMoreReaders(cids: AnyLink[], logger: Logger) {
    logger.Debug().Any("cids", cids).Msg("getMoreReaders-0");
    // const limit = pLimit(5);
    logger.Debug().Any("cids", cids).Msg("getMoreReaders-1");
    const missing = cids.filter((cid) => !this.carReaders.has(cid.toString()));
    logger.Debug().Any("cids", cids).Msg("getMoreReaders-2");
    await Promise.all(
      missing.map((cid, idx) => {
        logger.Debug().Any("cid", cid).Uint64("idx", idx).Msg("getMoreReaders-map");
        // return limit(async () => {
        logger.Debug().Any("cid", cid).Uint64("idx", idx).Msg("getMoreReaders-loadCar-pre");
        const ret = this.loadCar(cid);
        logger.Debug().Any("cid", cid).Uint64("idx", idx).Msg("getMoreReaders-loadCar-post");
        return ret;
        // })
      }),
    );
    logger.Debug().Any("cids", cids).Msg("getMoreReaders-3");
  }
}

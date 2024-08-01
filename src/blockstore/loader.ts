import pLimit from "p-limit";
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
  RemoteMetaStore,
  MetaStore,
  BaseStore,
  type Loadable,
  BlockstoreRuntime,
  BlockstoreOpts,
} from "./types.js";

import { parseCarFile } from "./loader-helpers.js";
import { decodeEncryptedCar } from "./encrypt-helpers.js";

// import { DataStoreImpl, MetaStoreImpl, RemoteWALImpl } from "./store.js";

import { CarTransaction, defaultedBlockstoreRuntime } from "./transaction.js";
import { CommitQueue } from "./commit-queue.js";
import type { Falsy } from "../types.js";
import { getKeyBag } from "../runtime/key-bag.js";
import { CID } from "multiformats";
import { commit, commitFiles, CommitParams } from "./commitor.js";
import { decode } from "multiformats/block";
import { sha256 as hasher } from "multiformats/hashes/sha2";

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

  carLog: CarLog = [];
  // key?: string;
  // keyId?: string;
  remoteMetaStore?: RemoteMetaStore;
  remoteCarStore?: DataStore;
  remoteFileStore?: DataStore;

  private getBlockCache = new Map<string, AnyBlock>();
  private seenMeta = new Set<string>();
  private writeLimit = pLimit(1);

  // readonly id = uuidv4();

  async keyBag() {
    return getKeyBag(this.ebOpts.keyBag);
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
  constructor(name: string, ebOpts: BlockstoreOpts) {
    this.name = name;
    // console.log("Loader", name, ebOpts)
    this.ebOpts = defaultedBlockstoreRuntime(
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
    this.logger.Debug().Any("metas", metas).Msg("handleDbMetasFromStore");
    for (const meta of metas) {
      await this.writeLimit(async () => {
        await this.mergeDbMetaIntoClock(meta);
      });
    }
  }

  async mergeDbMetaIntoClock(meta: DbMeta): Promise<void> {
    if (this.isCompacting) {
      throw this.logger.Error().Msg("cannot merge while compacting").AsError();
    }

    if (this.seenMeta.has(meta.cars.toString())) return;
    this.seenMeta.add(meta.cars.toString());

    // if (meta.key) {
    //   await this.setKey(meta.key);
    // }
    if (carLogIncludesGroup(this.carLog, meta.cars)) {
      return;
    }
    const carHeader = await this.loadCarHeaderFromMeta<TransactionMeta>(meta);
    // fetch other cars down the compact log?
    // todo we should use a CID set for the compacted cids (how to expire?)
    // console.log('merge carHeader', carHeader.head.length, carHeader.head.toString(), meta.car.toString())
    carHeader.compact.map((c) => c.toString()).forEach(this.seenCompacted.add, this.seenCompacted);
    await this.getMoreReaders(carHeader.cars.flat());
    this.carLog = [...uniqueCids([meta.cars, ...this.carLog, ...carHeader.cars], this.seenCompacted)];
    await this.ebOpts.applyMeta?.(carHeader.meta);
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

  async loadFileCar(cid: AnyLink/*, isPublic = false*/): Promise<CarReader> {
    return await this.storesLoadCar(cid, await this.fileStore(), this.remoteFileStore);
  }

  async commit<T = TransactionMeta>(
    t: CarTransaction,
    done: T,
    opts: CommitOpts = { noLoader: false, compact: false },
  ): Promise<CarGroup> {
    await this.ready();
    const fstore = await this.fileStore();
    const params: CommitParams = {
      encoder: (await fstore.keyedCrypto()).codec(),
      carLog: this.carLog,
      carStore: fstore,
      WALStore: await this.WALStore(),
      metaStore: await this.metaStore(),
    };
    return this.commitQueue.enqueue(async () => {
      await this.cacheTransaction(t);
      const ret = await commit(params, t, done, opts)
      await this.updateCarLog(ret.cgrp, ret.header, !!opts.compact);
      return ret.cgrp;
  });
  }

  async updateCarLog<T>(cids: CarGroup, fp: CarHeader<T>, compact: boolean): Promise<void> {
    if (compact) {
      const previousCompactCid = fp.compact[fp.compact.length - 1];
      fp.compact.map((c) => c.toString()).forEach(this.seenCompacted.add, this.seenCompacted);
      this.carLog = [...uniqueCids([...this.carLog, ...fp.cars, cids], this.seenCompacted)];
      await this.removeCidsForCompact(previousCompactCid[0]);
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
    const loaded = await this.storesLoadCar(cid, await this.carStore(), this.remoteCarStore);
    return loaded;
  }


  async makeDecoderAndCarReader(cid: AnyLink, local: DataStore, remote?: DataStore) {
    const cidsString = cid.toString();
    let loadedCar: AnyBlock | undefined = undefined;
    let activeStore: BaseStore = local;
    try {
      //loadedCar now is an array of AnyBlocks
      this.logger.Debug().Str("cid", cidsString).Msg("loading car");
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
          activeStore = remote
        }
      } else {
        this.logger.Error().Str("cid", cidsString).Err(e).Msg("loading car");
      }
    }
    if (!loadedCar) {
      throw this.logger.Error().Url(local.url).Str("cid", cidsString).Msg("missing car files").AsError();
    }
    //This needs a fix as well as the fromBytes function expects a Uint8Array
    //Either we can merge the bytes or return an array of rawReaders
    const bytes = await decode({ bytes: loadedCar.bytes, hasher, codec: (await activeStore.keyedCrypto()).codec() }) // as Uint8Array,
    const rawReader = await CarReader.fromBytes(bytes.value)
    const readerP = Promise.resolve(rawReader)
    // const kc = await activeStore.keyedCrypto()
    // const readerP = !kc.isEncrypting ? Promise.resolve(rawReader) : this.ensureDecryptedReader(activeStore, rawReader);

    const cachedReaderP = readerP.then(async (reader) => {
      await this.cacheCarReader(cidsString, reader).catch((e) => {
        this.logger.Error().Err(e).Str("cid", cidsString).Msg("error caching car reader")
        return;
      });
      return reader;
    });
    this.carReaders.set(cidsString, cachedReaderP);
    return readerP;
  }

  //What if instead it returns an Array of CarHeader
  protected async storesLoadCar(cid: AnyLink, local: DataStore, remote?: DataStore): Promise<CarReader> {
    const cidsString = cid.toString();
    let dacr = this.carReaders.get(cidsString)
    if (!dacr) {
      dacr = this.makeDecoderAndCarReader(cid, local, remote);
      this.carReaders.set(cidsString, dacr);
    }
    return dacr;
  }

  // class decryptedReader extends CarReader {
  //   constructor(rawReader: CarReader) {
  //     super(rawReader._header, rawReader._blocks);
  //   }
  //   getRoots(): Promise<CID[]> {
  //     return this._header.roots;
  //   }

  // }

  protected async ensureDecryptedReader(store: BaseStore, reader: CarReader): Promise<CarReader> {
    // const theKey = await this._getKey();
    // if (this.ebOpts.public || !(theKey && this.ebOpts.crypto)) {
    const kycy = await store.keyedCrypto();
    if (!kycy.isEncrypting) {
      return reader;
    }
    const { blocks, root } = await decodeEncryptedCar(this.logger, kycy, reader);
    return {
      getRoots: () => [root],
      get: async (cid: CID) => {
        const res = await blocks.get(cid)
        this.logger.Debug().Str("cid", cid.toString()).Len(res?.bytes).Msg("get block")
        return res
      },
      blocks: blocks.entries.bind(blocks),
    } as unknown as CarReader;
  }

  // protected async setKey(key: string) {
  //   if (this.key && this.key !== key)
  //     throw this.logger.Error().Str("name", this.name).Str("this.key", this.key).Str("key", key).Msg("setting key").AsError();
  //   this.key = key;
  //   const encoder = new TextEncoder();
  //   const data = encoder.encode(key);
  //   const hashBuffer = await this.ebOpts.crypto.digestSHA256(data);
  //   const hashArray = Array.from(new Uint8Array(hashBuffer));
  //   this.keyId = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  // }

  protected async getMoreReaders(cids: AnyLink[]) {
    const limit = pLimit(5);
    const missing = cids.filter((cid) => !this.carReaders.has(cid.toString()));
    await Promise.all(missing.map((cid) => limit(() => this.loadCar(cid))));
  }
}

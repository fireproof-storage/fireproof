import pLimit from "p-limit";
import { CarReader } from "@ipld/car/reader";
import { KeyedResolvOnce, Logger, LRUSet, ResolveOnce } from "@adviser/cement";
// import { uuidv4 } from "uuidv7";

import {
  type AnyBlock,
  type AnyLink,
  type CarHeader,
  type CommitOpts,
  type TransactionMeta,
  type CarGroup,
  type Loadable,
  BlockstoreRuntime,
  BlockstoreOpts,
  AttachedStores,
  ActiveStore,
  BaseStore,
  CIDActiveStore,
  CarCacheItem,
  CarLog,
  FroozenCarLog,
  CarStore,
} from "./types.js";

import { parseCarFile } from "./loader-helpers.js";

import { defaultedBlockstoreRuntime } from "./transaction.js";
import { CommitQueue } from "./commit-queue.js";
import { PARAM, type Attachable, type Attached, type CarTransaction, type DbMeta, type Falsy, type SuperThis } from "../types.js";
import { getKeyBag, KeyBag } from "../runtime/key-bag.js";
import { commit, commitFiles, CommitParams } from "./commitor.js";
import { decode } from "../runtime/wait-pr-multiformats/block.js";
import { sha256 as hasher } from "multiformats/hashes/sha2";
import { TaskManager } from "./task-manager.js";
import { AttachedRemotesImpl, createAttachedStores } from "./attachable-store.js";
import { ensureLogger, isNotFoundError } from "../utils.js";

export function carLogIncludesGroup(list: FroozenCarLog, cids: CarGroup) {
  const cidSet = cids
    .map((cid) => cid.toString())
    .sort()
    .join(",");
  return list.some(
    (arr: CarGroup) =>
      cidSet ===
      arr
        .map((cid) => cid.toString())
        .sort()
        .join(","),
  );
}

// this works for car groups because toString looks like bafy,bafy
function uniqueCids(list: FroozenCarLog, remove = new LRUSet<string>()): FroozenCarLog {
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
  readonly logger: Logger;
  readonly commitQueue: CommitQueue<CarGroup> = new CommitQueue<CarGroup>();
  isCompacting = false;
  private readonly cidCache: KeyedResolvOnce<CarCacheItem>;
  private readonly maxConcurrentCarReader: ReturnType<typeof pLimit>;
  private readonly maxConcurrentWrite = pLimit(1);
  readonly seenCompacted: LRUSet<string>;
  // readonly processedCars: Set<string> = new Set<string>();
  readonly sthis: SuperThis;
  readonly taskManager: TaskManager;

  readonly carLog: CarLog = new CarLog();
  // key?: string;
  // keyId?: string;
  // remoteMetaStore?: MetaStore;
  // remoteCarStore?: DataStore;
  // remoteFileStore?: DataStore;

  readonly attachedStores: AttachedStores;

  async attach(attached: Attachable): Promise<Attached> {
    const at = await this.attachedStores.attach(attached);
    if (!at.stores.wal) {
      try {
        // remote Store need to kick off the sync by requesting the latest meta
        const dbMeta = await at.stores.meta.load();
        if (!Array.isArray(dbMeta)) {
          throw this.logger.Error().Msg("missing dbMeta").AsError();
        }
        await this.handleDbMetasFromStore(dbMeta, this.attachedStores.activate(at.stores));
      } catch (e) {
        this.logger.Error().Err(e).Msg("error attaching store");
        at.detach();
      }
    }
    return at;
  }

  // private getBlockCache = new Map<string, AnyBlock>();
  private seenMeta: LRUSet<string>;

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
    // console.log("destroy", this.attachedStores.local().baseStores().map((store) => store.url().toString()));
    await Promise.all(
      this.attachedStores
        .local()
        .baseStores()
        .map((store) => store.destroy()),
    );
  }

  constructor(sthis: SuperThis, ebOpts: BlockstoreOpts) {
    // this.name = name;
    this.sthis = sthis;
    this.ebOpts = defaultedBlockstoreRuntime(
      sthis,
      {
        ...ebOpts,
        // name,
      },
      "Loader",
    );
    this.logger = ensureLogger(sthis, "Loader");
    this.cidCache = new KeyedResolvOnce({
      lru: {
        maxEntries: parseInt(this.ebOpts.storeUrls.car.getParam(PARAM.CAR_CACHE_SIZE, "1000"), 10),
      },
    });
    this.seenMeta = new LRUSet({
      maxEntries: parseInt(this.ebOpts.storeUrls.meta.getParam(PARAM.CAR_META_CACHE_SIZE, "1000"), 10),
    });
    this.seenCompacted = new LRUSet({
      maxEntries: parseInt(this.ebOpts.storeUrls.car.getParam(PARAM.CAR_COMPACT_CACHE_SIZE, "1000"), 10),
    });
    this.maxConcurrentCarReader = pLimit(parseInt(this.ebOpts.storeUrls.car.getParam(PARAM.CAR_PARALLEL, "5"), 10));

    this.taskManager = new TaskManager(sthis, async (dbMeta: DbMeta, activeStore: ActiveStore) => {
      // console.log(
      //   "taskManager",
      //   dbMeta.cars.map((c) => c.toString()),
      // );
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
    // console.log(
    //   "handleDbMetasFromStore",
    //   activeStore.active.car.url().toString(),
    //   metas.map((m) => m.cars.map((c) => c.toString())).flat(),
    // );
    this.logger.Debug().Any("metas", metas).Url(activeStore.active.car.url()).Msg("handleDbMetasFromStore");
    for (const meta of metas) {
      await this.maxConcurrentWrite(async () => {
        await this.mergeDbMetaIntoClock(meta, activeStore);
      });
    }
  }

  async mergeDbMetaIntoClock(meta: DbMeta, activeStore: ActiveStore): Promise<void> {
    if (this.isCompacting) {
      throw this.logger.Error().Msg("cannot merge while compacting").AsError();
    }
    try {
      this.isCompacting = true;
      // this could be abit more compact
      const metaKey = meta.cars
        .map((i) => i.toString())
        .sort()
        .join(",");
      if (this.seenMeta.has(metaKey)) return;
      this.seenMeta.add(metaKey);

      // if (meta.key) {
      //   await this.setKey(meta.key);
      // }
      if (carLogIncludesGroup(this.carLog.asArray(), meta.cars)) {
        return;
      }
      const carHeader = await this.loadCarHeaderFromMeta<TransactionMeta>(meta, activeStore);
      // fetch other cars down the compact log?
      // todo we should use a CID set for the compacted cids (how to expire?)
      // console.log('merge carHeader', carHeader.head.length, carHeader.head.toString(), meta.car.toString())
      carHeader.compact.map((c) => c.toString()).forEach((k) => this.seenCompacted.add(k), this.seenCompacted);
      try {
        await this.getMoreReaders(carHeader.cars.flat(), activeStore);
      } catch (e) {
        this.logger.Error().Err(e).Msg("error getting more readers");
      }
      this.carLog.update(uniqueCids([meta.cars, ...this.carLog.asArray(), ...carHeader.cars], this.seenCompacted));
      // console.log(
      //   ">>>>> pre applyMeta",
      //   this.carLog
      //     .asArray()
      //     .map((c) => c.map((cc) => cc.toString()))
      //     .flat(),
      // );
      await this.ebOpts.applyMeta?.(carHeader.meta);
      // console.log(">>>>> post applyMeta");
    } finally {
      this.isCompacting = false;
    }
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

  async loadFileCar(cid: AnyLink /*, isPublic = false*/, store: ActiveStore): Promise<CarCacheItem> {
    return await this.storesLoadCar(cid, store.fileStore()); // store.local.file, store.remotes.map((r) => r.file));
  }

  async commit<T = TransactionMeta>(
    t: CarTransaction,
    done: T,
    opts: CommitOpts = { noLoader: false, compact: false },
  ): Promise<CarGroup> {
    await this.ready();
    const carStore = this.attachedStores.local().active.car;
    const params: CommitParams = {
      encoder: (await carStore.keyedCrypto()).codec(),
      carLog: this.carLog,
      carStore: carStore,
      WALStore: this.attachedStores.local().active.wal,
      metaStore: this.attachedStores.local().active.meta,
      threshold: this.ebOpts.threshold,
    };
    return this.commitQueue.enqueue(async () => {
      await this.cacheTransaction(t);
      const ret = await commit(params, t, done, opts);
      await this.updateCarLog(ret.cgrp, ret.header, !!opts.compact);
      return ret.cgrp;
    });
  }

  async updateCarLog<T>(cids: CarGroup, cHeader: CarHeader<T>, compact: boolean): Promise<void> {
    // if (this.carLog.length === 0) {
    //   // console.log("updateCarLog", cids.map((c) => c.toString()));
    // }

    if (compact) {
      const previousCompactCid = cHeader.compact[cHeader.compact.length - 1];
      cHeader.compact.map((c) => c.toString()).forEach(this.seenCompacted.add, this.seenCompacted);
      this.carLog.update(uniqueCids([...this.carLog.asArray(), ...cHeader.cars, cids], this.seenCompacted));
      // console.log(
      //   "compact - updateCarLog",
      //   this.carLog
      //     .asArray()
      //     .map((c) => c.map((cc) => cc.toString()))
      //     .flat(),
      // );
      await this.removeCidsForCompact(previousCompactCid[0], this.attachedStores.local()).catch((e) => e);
    } else {
      // console.log(
      //   "update - updateCarLog",
      //   this.carLog
      //     .asArray()
      //     .map((c) => c.map((cc) => cc.toString()))
      //     .flat(),
      // );
      this.carLog.xunshift(cids);
    }
  }

  async cacheTransaction(t: CarTransaction) {
    for await (const block of t.entries()) {
      const sBlock = block.cid.toString();
      this.cidCache.get(sBlock).once(
        () =>
          ({
            type: "block",
            cid: block.cid,
            blocks: [block],
            roots: [],
          }) satisfies CarCacheItem,
      );
    }
  }

  // /**
  //  *
  //  * @returns the list of blocks which was read from the car file
  //  */
  // private async readCar(reader: CarReader): Promise<AnyBlock[]> {
  //   const blocks: AnyBlock[] = [];
  //   for await (const block of reader.blocks()) {
  //     const sBlock = block.cid.toString();
  //     this.cidCache.get(sBlock).once(() => {
  //       blocks.push(block);
  //       return [block];
  //     });
  //   }
  //   return blocks;
  // }

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

  async *entries(/*cache = true*/): AsyncIterableIterator<AnyBlock> {
    await this.ready();
    // for (const { value } of this.cidCache.values()) {
    //   if (value.isOk() && value.Ok().type === "block") {
    //     for (const block of value.Ok().blocks) {
    //       yield block;
    //     }
    //   }
    // }
    // if (cache) {
    //   return;
    // }
    // console.log("entries", this.carLog.map((c) => c.map((cc) => cc.toString())).flat());
    const seen = new Set<string>();
    for (const carCids of this.carLog.asArray()) {
      for (const carCid of carCids) {
        const reader = await this.loadCar(carCid, this.attachedStores.local());
        if (!reader || reader.type !== "car") {
          throw this.logger.Error().Any("reader", reader.type).Str("cid", carCid.toString()).Msg("missing car reader").AsError();
        }
        // console.log(
        //   "entries",
        //   carCid.toString(),
        //   reader.blocks.map((b) => b.cid.toString()),
        // );
        // const readBlocks = await this.readCar(reader);
        for (const block of reader.blocks) {
          const cidStr = block.cid.toString();
          if (seen.has(cidStr)) continue;
          seen.add(cidStr);
          yield block;
        }
      }
    }
  }

  async getBlock(cid: AnyLink, store: ActiveStore): Promise<AnyBlock | Falsy> {
    await this.ready();
    const cidStr = cid.toString();
    const ci = await this.cidCache.get(cidStr).once(async () => {
      // console.log("getBlock", cidStr);
      // const getCarCid = async (carCid: AnyLink) => {
      //   const sCid = carCid.toString();
      //   if (this.getBlockCache.has(sCid)) return this.getBlockCache.get(sCid);
      //   const reader = await this.loadCar(carCid, store);
      //   if (!reader) {
      //     throw this.logger.Error().Str("cid", sCid).Msg("missing car reader").AsError();
      //   }
      //   await this.cacheCarReader(sCid, reader).catch((e) => {
      //     this.logger.Error().Err(e).Str("cid", sCid).Msg("error caching car reader");
      //     return;
      //   });
      //   if (this.getBlockCache.has(sCid)) return this.getBlockCache.get(sCid);
      //   console.log("getBlock-error", sCid);
      //   throw this.logger.Error().Str("cid", sCid).Msg("block not in reader").AsError();
      // };

      const getCompactCarCids = async (carCid: AnyLink) => {
        const sCid = carCid.toString();
        const reader = await this.loadCar(carCid, store);
        // if (!reader) {
        //   throw this.logger.Error().Str("cid", carCid.toString()).Msg("missing car reader").AsError();
        // }
        const header = await parseCarFile(reader, this.logger);
        const compacts = header.compact;
        // let got: AnyBlock | undefined;

        // const batchSize = 5;
        // for (let i = 0; i < compacts.length; i += batchSize) {
        //   const promises: Promise<AnyBlock | undefined>[] = [];
        //   for (let j = i; j < Math.min(i + batchSize, compacts.length); j++) {
        //     for (const cid of compacts[j]) {
        //       promises.push(getCarCid(cid));
        //     }
        //   }
        const got = await Promise.allSettled(compacts.map((compact) => compact.map((cid) => this.loadCar(cid, store)).flat()));
        got
          .filter((result) => result.status === "rejected")
          .forEach((result) => {
            this.logger.Error().Err(result.reason).Str("cid", sCid).Msg("error getting compacted block");
          });

        // if (this.getBlockCache.has(sCid)) return this.getBlockCache.get(sCid);
        // throw this.logger.Error().Str("cid", sCid).Msg("block not in compact reader").AsError();
      };

      let got: AnyBlock | undefined;
      for (const carCids of this.carLog.asArray()) {
        for (const carCid of carCids) {
          const ci = await this.loadCar(carCid, store);
          if (!ci) {
            this.logger.Error().Str("cid", carCid.toString()).Msg("missing CarCID");
            continue;
          }
          got = ci.blocks.find((block) => block.cid.equals(cid));
          if (got) {
            break;
          }
        }
      }
      if (!got) {
        await getCompactCarCids(this.carLog.last()[0]);
      }
      return {
        type: "block",
        cid: cid,
        blocks: got ? [got] : [],
        roots: [],
      };
    });
    if (!(ci.type === "block" && ci.blocks.length === 1)) {
      throw this.logger.Error().Str("cid", cidStr).Any("block", ci).Msg("missing block").AsError();
    }
    return ci.blocks[0];
  }

  async loadCar(cid: AnyLink, store: ActiveStore): Promise<CarCacheItem> {
    const loaded = await this.storesLoadCar(cid, store.carStore());
    return loaded;
  }

  private async makeDecoderAndCarReader(carCid: AnyLink, store: CIDActiveStore): Promise<CarCacheItem> {
    const carCidStr = carCid.toString();
    let loadedCar: AnyBlock | undefined = undefined;
    let activeStore: BaseStore = store.local();
    try {
      //loadedCar now is an array of AnyBlocks
      this.logger.Debug().Any("cid", carCidStr).Msg("loading car");
      loadedCar = await store.local().load(carCid);
      this.logger.Debug().Bool("loadedCar", loadedCar).Msg("loaded");
    } catch (e) {
      if (!isNotFoundError(e)) {
        throw this.logger.Error().Str("cid", carCidStr).Err(e).Msg("loading car");
      }
      for (const remote of store.remotes() as CarStore[]) {
        // console.log("makeDecoderAndCarReader", remote.url().toString());
        try {
          const remoteCar = await remote.load(carCid);
          if (remoteCar) {
            // todo test for this
            this.logger.Debug().Ref("cid", remoteCar.cid).Msg("saving remote car locally");
            await store.local().save(remoteCar);
            loadedCar = remoteCar;
            activeStore = remote;
            break;
          } else {
            this.logger.Error().Str("cid", carCidStr).Err(e).Msg("loading car");
          }
        } catch (e) {
          this.logger.Warn().Str("cid", carCidStr).Url(remote.url()).Err(e).Msg("loading car");
        }
      }
    }
    if (!loadedCar) {
      throw this.logger.Error().Url(store.local().url()).Str("cid", carCidStr).Msg("missing car files").AsError();
    }
    //This needs a fix as well as the fromBytes function expects a Uint8Array
    //Either we can merge the bytes or return an array of rawReaders
    const bytes = await decode({ bytes: loadedCar.bytes, hasher, codec: (await activeStore.keyedCrypto()).codec() }); // as Uint8Array,
    const rawReader = await CarReader.fromBytes(bytes.value.data);
    // const readerP = Promise.resolve(rawReader);
    // const kc = await activeStore.keyedCrypto()
    // const readerP = !kc.isEncrypting ? Promise.resolve(rawReader) : this.ensureDecryptedReader(activeStore, rawReader);

    const blocks: AnyBlock[] = [];
    for await (const block of rawReader.blocks()) {
      const sBlock = block.cid.toString();
      blocks.push(block);
      this.cidCache.get(sBlock).once<CarCacheItem>(() => ({
        type: "block",
        cid: block.cid,
        blocks: [block],
        roots: [],
      }));
    }
    return {
      type: "car",
      cid: carCid,
      blocks,
      roots: await rawReader.getRoots(),
    };
    // const cachedReaderP = readerP.then(async (reader) => {
    //   await this.cacheCarReader(carCidStr, reader).catch((e) => {
    //     this.logger.Error().Err(e).Str("cid", carCidStr).Msg("error caching car reader");
    //     return;
    //   });
    //   return reader;
    // });
    // this.cidCache.set(carCidStr, cachedReaderP);
    // return readerP;
  }

  //What if instead it returns an Array of CarHeader
  protected async storesLoadCar(carCid: AnyLink, store: CIDActiveStore): Promise<CarCacheItem> {
    const carCidStr = carCid.toString();
    // console.log("storesLoadCar", carCidStr);
    return this.cidCache.get(carCidStr).once(async () => {
      return this.maxConcurrentCarReader(() => this.makeDecoderAndCarReader(carCid, store));
    });
  }

  protected async getMoreReaders(cids: AnyLink[], store: ActiveStore) {
    for (const cid of cids) {
      // console.log("getMoreReaders>>>", cid.toString());
      await this.loadCar(cid, store);
    }
    // console.log("getMoreReaders<<<");
  }
}

import pLimit from "p-limit";
import { CarReader } from "@ipld/car/reader";
import {exception2Result, KeyedResolvOnce, Logger, LRUSet, ResolveOnce, Result } from "@adviser/cement";

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
  CIDActiveStore,
  CarLog,
  FroozenCarLog,
  CarStore,
  FPBlock,
  CarBlockItem,
  BlockFetcher,
  isCarBlockItemReady,
  isCarBlockItemStale,
  ReadyCarBlockItem,
} from "./types.js";

import { anyBlock2FPBlock, parseCarFile } from "./loader-helpers.js";

import { defaultedBlockstoreRuntime } from "./transaction.js";
import { CommitQueue } from "./commit-queue.js";
import {
  isFalsy,
  PARAM,
  type Attachable,
  type Attached,
  type CarTransaction,
  type DbMeta,
  type Falsy,
  type SuperThis,
} from "../types.js";
import { getKeyBag, KeyBag } from "../runtime/key-bag.js";
import { commit, commitFiles, CommitParams } from "./commitor.js";
import { decode } from "../runtime/wait-pr-multiformats/block.js";
import { sha256 as hasher } from "multiformats/hashes/sha2";
import { TaskManager } from "./task-manager.js";
import { AttachedRemotesImpl, createAttachedStores } from "./attachable-store.js";
import { ensureLogger, isNotFoundError } from "../utils.js";
import {Car2FPMsg} from "./fp-envelope.js";

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
  readonly blockstoreParent?: BlockFetcher;
  readonly ebOpts: BlockstoreRuntime;
  readonly logger: Logger;
  readonly commitQueue: CommitQueue<CarGroup> = new CommitQueue<CarGroup>();
  isCompacting = false;
  readonly cidCache: KeyedResolvOnce<FPBlock>;
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

  async tryToLoadStaleCars(store: ActiveStore) {
    const staleLoadcars: Promise<FPBlock<CarBlockItem>>[] = [];
    for (const { value: rvalue } of this.cidCache.values()) {
      if (rvalue.isErr()) {
        this.logger.Error().Err(rvalue).Msg("error loading car");
        return this;
      }
      const value = rvalue.Ok();
      if (isCarBlockItemStale(value)) {
        this.cidCache.unget(value.cid.toString());
        staleLoadcars.push(
          this.maxConcurrentCarReader(() =>
            this.loadCar(value.cid, store).then((fpcar) => {
              if (isCarBlockItemStale(fpcar)) {
                this.logger.Warn().Any({ cid: value.cid.toString(), type: value.item.type }).Msg("is stale");
              }
              return Promise.resolve(fpcar);
            }),
          ),
        );
      }
    }
    await Promise.all(staleLoadcars);
  }

  async attach(attachable: Attachable): Promise<Attached> {
    return await this.attachedStores.attach(attachable, async (at) => {
      if (!at.stores.wal) {
        try {
          const store = this.attachedStores.activate(at.stores);
          console.log("attach-1", store.active.car.url().toString())
          await this.tryToLoadStaleCars(store);
          console.log("attach-2", store.active.car.url().toString(), "local", store.local().carStore().active.url().toString())
          const localDbMeta = await store.local().active.meta.load();
          console.log("attach-3", localDbMeta, store.active.car.url().toString())
          // remote Store need to kick off the sync by requesting the latest meta
          const dbMeta = await store.active.meta.load();
          console.log("attach-4", store.active.car.url().toString())
          if (Array.isArray(dbMeta)) {
            if (dbMeta.length !== 0) {
              await this.handleDbMetasFromStore(dbMeta, store);
            }
          } else if (!isFalsy(dbMeta)) {
            throw this.logger.Error().Any({ dbMeta }).Msg("missing dbMeta").AsError();
          }
          if (localDbMeta) {
            console.log("attach-6", store.active.car.url())
            await this.ensureAttachedStore(store, localDbMeta);
          }
          console.log("attach-5", store.active.car.url())
        } catch (e) {
          await at.detach();
          throw this.logger.Error().Err(e).Msg("error attaching store").AsError()
        }
      }
      return at;
    });
  }

    private async ensureAttachedStore(store: ActiveStore, localDbMeta: DbMeta[]) {
      const localCarStore = store.local().carStore()
      // console.log("local", localCarStore.active.url(), "remote", store.active.car.url());

      const codec = (await localCarStore.active.keyedCrypto()).codec()
      for (const cargroup of localDbMeta) {
        for (const carId of cargroup.cars) {
          const car = await this.storesLoadCar(carId, localCarStore);
          const rStore = await exception2Result(async () => await store.active.car.save({
            cid: carId,
            bytes: await codec.encode(car.bytes),
          }))
          if (rStore.isErr()) {
            this.logger.Warn().Err(rStore).Str("cid", carId.toString()).Msg("error putting car");
          }
        }
        const res = await store.active.meta.save(cargroup)
        if (res.isErr()) {
          this.logger.Warn().Err(res.Err()).Msg("error saving meta");
        }
      }
      // TODO remeber
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
        this.blockstoreParent?.crdtParent?.ledgerParent?.name,
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

  constructor(sthis: SuperThis, ebOpts: BlockstoreOpts, blockstore?: BlockFetcher) {
    // this.name = name;
    this.sthis = sthis;
    this.blockstoreParent = blockstore;
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
        maxEntries: parseInt(this.ebOpts.storeUrls.car.getParam(PARAM.CAR_CACHE_SIZE, "1000000"), 10),
      },
    });
    this.seenMeta = new LRUSet({
      maxEntries: parseInt(this.ebOpts.storeUrls.meta.getParam(PARAM.CAR_META_CACHE_SIZE, "1000"), 10),
    });
    this.seenCompacted = new LRUSet({
      maxEntries: parseInt(this.ebOpts.storeUrls.car.getParam(PARAM.CAR_COMPACT_CACHE_SIZE, "1000"), 10),
    });
    this.maxConcurrentCarReader = pLimit(parseInt(this.ebOpts.storeUrls.car.getParam(PARAM.CAR_PARALLEL, "5"), 10));

    this.taskManager = new TaskManager(
      sthis,
      async (dbMeta: DbMeta, activeStore: ActiveStore) => {
        // console.log(
        //   "taskManager",
        //   dbMeta.cars.map((c) => c.toString()),
        // );
        await this.handleDbMetasFromStore([dbMeta], activeStore);
      },
      this.ebOpts.taskManager,
    );
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
    // console.log("handleDbMetasFromStore", metas);
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
      const warns = await this.getMoreReaders(carHeader.cars.flat(), activeStore).then((res) => res.filter((r) => r.isErr()));
      if (warns.length > 0) {
        this.logger.Warn().Any("warns", warns).Msg("error getting more readers");
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
    if (isCarBlockItemStale(reader)) {
      this.logger.Warn().Str("cid", dbm.cars[0].toString()).Msg("stale loadCarHeaderFromMeta");
    } else if (isCarBlockItemReady(reader)) {
      return await parseCarFile(reader, this.logger);
    }
    return {
      cars: [],
      compact: [],
      meta: {} as T,
    };
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

  async loadFileCar(cid: AnyLink /*, isPublic = false*/, store: ActiveStore): Promise<FPBlock<CarBlockItem>> {
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
      this.carLog.unshift(cids);
    }
  }

  async cacheTransaction(t: CarTransaction) {
    for await (const block of t.entries()) {
      const sBlock = block.cid.toString();
      this.cidCache.get(sBlock).once(
        () => block,
        // ({
        //   type: "block",
        //   status: "ready",
        //   cid: block.cid,
        //   blocks: [block],
        //   roots: [],
        // }) satisfies CarBlockItem,
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

  async *entries(/*cache = true*/): AsyncIterableIterator<FPBlock> {
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
        if (isCarBlockItemStale(reader)) {
          this.logger.Warn().Any({
            cid: carCid.toString(),
            url: this.attachedStores.local().carStore().active.url()
          }).Err(reader.item.statusCause).Msg("entries-stale car");
          continue;
        }
        if (!isCarBlockItemReady(reader)) {
          throw this.logger.Error().Any({ cid: carCid.toString(), item: reader.item }).Msg("missing car reader").AsError();
        }
        // console.log(
        //   "entries",
        //   carCid.toString(),
        //   reader.blocks.map((b) => b.cid.toString()),
        // );
        // const readBlocks = await this.readCar(reader);
        for (const block of reader.item.value.car.blocks) {
          const cidStr = block.cid.toString();
          if (seen.has(cidStr)) continue;
          seen.add(cidStr);
          yield block;
        }
      }
    }
  }

  async getBlock(cid: AnyLink): Promise<FPBlock | Falsy> {
    await this.ready();
    const got = this.cidCache.get(cid.toString());
    return got.value;
  }

  async getCompactCarCids(carCid: AnyLink, store: ActiveStore): Promise<void> {
    const sCid = carCid.toString();
    const reader = await this.loadCar(carCid, store);
    if (isCarBlockItemStale(reader)) {
      this.logger.Warn().Str("cid", sCid).Err(reader.item.statusCause).Msg("stale getCompactCarCids");
      return;
    }
    if (!isCarBlockItemReady(reader)) {
      this.logger.Warn().Str("cid", sCid).Msg("is not ready");
      return;
    }
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
  }

  async loadCar(cid: AnyLink, store: ActiveStore): Promise<FPBlock<CarBlockItem>> {
    const loaded = await this.storesLoadCar(cid, store.carStore());
    if (isCarBlockItemStale(loaded)) {
      this.logger.Warn().Any({
        cid: loaded.cid.toString(),
        url: this.attachedStores.local().carStore().active.url()
      }).Err(loaded.item.statusCause).Msg("load-car-stale car");
    }
    return loaded;
  }

  private async makeDecoderAndCarReader(carCid: AnyLink, store: CIDActiveStore): Promise<FPBlock<CarBlockItem>> {
    const carCidStr = carCid.toString();
    let loadedCar: AnyBlock | undefined;
    const activeStore = store.active as CarStore;
    try {
      //loadedCar now is an array of AnyBlocks
      this.logger.Debug().Any("cid", carCidStr).Msg("loading car");
      loadedCar = await activeStore.load(carCid);
      // console.log("loadedCar", carCid);
      this.logger.Debug().Bool("loadedCar", loadedCar).Msg("loaded");
    } catch (e) {
      if (!isNotFoundError(e)) {
        throw this.logger.Error().Str("cid", carCidStr).Err(e).Msg("loading car");
      }
      // for (const remote of store.remotes() as CarStore[]) {
      //   // console.log("makeDecoderAndCarReader:remote:", remote.url().toString());
      //   try {
      //     const remoteCar = await remote.load(carCid);
      //     if (remoteCar) {
      //       // todo test for this
      //       this.logger.Debug().Ref("cid", remoteCar.cid).Msg("saving remote car locally");
      //       await store.local().save(remoteCar);
      //       loadedCar = remoteCar;
      //       activeStore = remote;
      //       break;
      //     } else {
      //       this.logger.Error().Str("cid", carCidStr).Err(e).Msg("loading car");
      //     }
      //   } catch (e) {
      //     this.logger.Warn().Str("cid", carCidStr).Url(remote.url()).Err(e).Msg("loading car");
      //   }
      // }
    }
    if (!loadedCar) {
      return {
        cid: carCid,
        bytes: new Uint8Array(0),
        item: {
          status: "stale",
          statusCause: new Error("missing car file"),
          type: "car",
          origin: await activeStore.id(),
          value: undefined,
        },
      };
    }
    //This needs a fix as well as the fromBytes function expects a Uint8Array
    //Either we can merge the bytes or return an array of rawReaders
    const bytes = await decode({ bytes: loadedCar.bytes, hasher, codec: (await activeStore.keyedCrypto()).codec() }); // as Uint8Array,
    const rawReader = await CarReader.fromBytes(bytes.value.data);
    // const readerP = Promise.resolve(rawReader);
    // const kc = await activeStore.keyedCrypto()
    // const readerP = !kc.isEncrypting ? Promise.resolve(rawReader) : this.ensureDecryptedReader(activeStore, rawReader);

    const blocks: FPBlock[] = [];
    for await (const rawBlock of rawReader.blocks()) {
      const sBlock = rawBlock.cid.toString();
      const block = await anyBlock2FPBlock(rawBlock);
      blocks.push(block);
      // console.log("loadBlock", block.cid);
      this.cidCache.get(sBlock).once(() => block);
      //   ({
      //   type: "block",
      //   status: "ready",
      //   cid: block.cid,
      //   blocks: [block],
      //   roots: [],
      // }));
    }
    return {
      cid: carCid,
      bytes: bytes.value.data,
      item: {
        type: "car",
        status: "ready",
        origin: await activeStore.id(),
        value: {
          car: {
            blocks,
            roots: await rawReader.getRoots(),
          },
        },
      } satisfies ReadyCarBlockItem,
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
  protected async storesLoadCar(carCid: AnyLink, store: CIDActiveStore): Promise<FPBlock<CarBlockItem>> {
    const carCidStr = carCid.toString();
    return this.cidCache.get(carCidStr).once(async () => {
      return this.maxConcurrentCarReader(() => this.makeDecoderAndCarReader(carCid, store));
    });
  }

  protected async getMoreReaders(cids: AnyLink[], store: ActiveStore): Promise<Result<FPBlock<CarBlockItem>>[]> {
    return Promise.all(
      cids.map(async (cid) =>
        this.loadCar(cid, store)
          .then((readers) => Result.Ok(readers))
          .catch((e) => Result.Err(e)),
      ),
    );
    // for (const cid of cids) {
    //   await this.loadCar(cid, store);
    // }
    // console.log("getMoreReaders<<<");
  }
}

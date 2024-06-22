import pLimit from "p-limit";
import { CarReader } from "@ipld/car";

import {
  type AnyBlock,
  type AnyLink,
  type CarHeader,
  type CommitOpts,
  type DbMeta,
  type TransactionMeta,
  type CarGroup,
  type CarLog,
  type DownloadDataFnParams,
  type DownloadMetaFnParams,
  type UploadDataFnParams,
  type UploadMetaFnParams,
  toCIDBlock,
} from "./types";
import type { BlockstoreOpts, BlockstoreRuntime } from "./transaction";

import { encodeCarFile, encodeCarHeader, parseCarFile } from "./loader-helpers";
import { decodeEncryptedCar, encryptedEncodeCarFile } from "./encrypt-helpers";

import { DataStore, MetaStore } from "./store";
import { RemoteWAL } from "./remote-wal";

import { DataStore as AbstractDataStore, MetaStore as AbstractMetaStore } from "./store";
import { CarTransaction, defaultedBlockstoreRuntime } from "./transaction";
import { CommitQueue } from "./commit-queue";
import * as CBW from "@ipld/car/buffer-writer";
import { Falsy } from "../types";

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

export function toHexString(byteArray: Uint8Array) {
  return Array.from(byteArray)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

abstract class AbstractRemoteMetaStore extends AbstractMetaStore {
  abstract handleByteHeads(byteHeads: Uint8Array[], branch?: string): Promise<DbMeta[]>;
}

export abstract class Loadable {
  name = "";
  remoteCarStore?: DataStore;
  abstract carStore(): Promise<DataStore>;
  carLog: CarLog = new Array<CarGroup>();
  remoteMetaStore?: AbstractRemoteMetaStore;
  remoteFileStore?: AbstractDataStore;
  abstract fileStore(): Promise<DataStore>;
}

export class Loader implements Loadable {
  readonly name: string;
  readonly ebOpts: BlockstoreRuntime;
  readonly commitQueue: CommitQueue<CarGroup> = new CommitQueue<CarGroup>();
  readonly isCompacting = false;
  readonly carReaders = new Map<string, Promise<CarReader>>();
  readonly ready: Promise<void>;
  readonly seenCompacted = new Set<string>();
  readonly processedCars = new Set<string>();

  carLog: CarLog = [];
  key?: string;
  keyId?: string;
  isWriting = false;
  writing = Promise.resolve();
  remoteMetaStore?: AbstractRemoteMetaStore;
  remoteCarStore?: AbstractDataStore;
  remoteFileStore?: AbstractDataStore;

  private getBlockCache = new Map<string, AnyBlock>();
  private seenMeta = new Set<string>();

  async carStore(): Promise<DataStore> {
    return this.ebOpts.store.makeDataStore(this);
  }

  async fileStore(): Promise<DataStore> {
    return this.ebOpts.store.makeDataStore(this);
  }
  async remoteWAL(): Promise<RemoteWAL> {
    return this.ebOpts.store.makeRemoteWAL(this);
  }

  async metaStore(): Promise<MetaStore> {
    return this.ebOpts.store.makeMetaStore(this);
  }

  constructor(name: string, ebOpts: BlockstoreOpts) {
    this.name = name;
    this.ebOpts = defaultedBlockstoreRuntime({
      ...ebOpts,
      name,
    });
    this.ready = Promise.resolve().then(async () => {
      // if (!this.metaStore || !this.carStore || !this.remoteWAL) throw new Error("stores not initialized");
      const metas = this.ebOpts.meta ?
        [this.ebOpts.meta] :
        await (await this.metaStore()).load("main");
      if (metas) {
        await this.handleDbMetasFromStore(metas);
      }
    });
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
    for (const meta of metas) {
      const writingFn = async () => {
        this.isWriting = true;
        await this.mergeDbMetaIntoClock(meta);
        this.isWriting = false;
      };
      void this._setWaitForWrite(writingFn);
      await writingFn();
    }
  }

  async mergeDbMetaIntoClock(meta: DbMeta): Promise<void> {
    if (this.isCompacting) {
      throw new Error("cannot merge while compacting");
    }

    if (this.seenMeta.has(meta.cars.toString())) return;
    this.seenMeta.add(meta.cars.toString());

    if (meta.key) {
      await this.setKey(meta.key);
    }
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

  protected async ingestKeyFromMeta(meta: DbMeta): Promise<void> {
    const { key } = meta;
    if (key) {
      await this.setKey(key);
    }
  }

  async loadCarHeaderFromMeta<T>({ cars: cids }: DbMeta): Promise<CarHeader<T>> {
    //Call loadCar for every cid
    const reader = await this.loadCar(cids[0]);
    return await parseCarFile(reader);
  }

  async _getKey(): Promise<string | undefined> {
    if (this.key) return this.key;
    // generate a random key
    if (!this.ebOpts.public) {
      await this.setKey(toHexString(this.ebOpts.crypto.randomBytes(32)));
    }
    return this.key || undefined;
  }

  async commitFiles(
    t: CarTransaction,
    done: TransactionMeta,
    opts: CommitOpts = { noLoader: false, compact: false },
  ): Promise<CarGroup> {
    return this.commitQueue.enqueue(() => this._commitInternalFiles(t, done, opts));
  }
  // can these skip the queue? or have a file queue?
  async _commitInternalFiles(
    t: CarTransaction,
    done: TransactionMeta,
    opts: CommitOpts = { noLoader: false, compact: false },
  ): Promise<CarGroup> {
    await this.ready;
    const { files: roots } = this.makeFileCarHeader(done) as {
      files: AnyLink[];
    };
    const cids: AnyLink[] = [];
    const cars = await this.prepareCarFilesFiles(roots, t, !!opts.public);
    for (const car of cars) {
      const { cid, bytes } = car;
      await (await this.fileStore()).save({ cid, bytes });
      await (await this.remoteWAL()).enqueueFile(cid, !!opts.public);
      cids.push(cid);
    }

    return cids;
  }

  async loadFileCar(cid: AnyLink, isPublic = false): Promise<CarReader> {
    return await this.storesLoadCar(cid, await this.fileStore(), this.remoteFileStore, isPublic);
  }

  async commit<T = TransactionMeta>(
    t: CarTransaction,
    done: T,
    opts: CommitOpts = { noLoader: false, compact: false },
  ): Promise<CarGroup> {
    return this.commitQueue.enqueue(() => this._commitInternal(t, done, opts));
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

  async _commitInternal<T>(t: CarTransaction, done: T, opts: CommitOpts = { noLoader: false, compact: false }): Promise<CarGroup> {
    await this.ready;
    const fp = this.makeCarHeader<T>(done, this.carLog, !!opts.compact);
    console.log("committing", fp.cars.length, fp.compact.length, fp.meta);
    const rootBlock = await encodeCarHeader(fp);

    const cars = await this.prepareCarFiles(rootBlock, t, !!opts.public);
    const cids: AnyLink[] = [];
    for (const car of cars) {
      const { cid, bytes } = car;
      await (await this.carStore()).save({ cid, bytes });
      cids.push(cid);
    }

    await this.cacheTransaction(t);
    const newDbMeta = { cars: cids, key: this.key || null } as DbMeta;
    await (await this.remoteWAL()).enqueue(newDbMeta, opts);
    await (await this.metaStore()).save(newDbMeta);
    await this.updateCarLog(cids, fp, !!opts.compact);
    return cids;
  }

  async prepareCarFilesFiles(
    roots: AnyLink[],
    t: CarTransaction,
    isPublic: boolean,
  ): Promise<{ cid: AnyLink; bytes: Uint8Array }[]> {
    const theKey = isPublic ? null : await this._getKey();
    const car =
      theKey && this.ebOpts.crypto
        ? await encryptedEncodeCarFile(this.ebOpts.crypto, theKey, roots[0], t)
        : await encodeCarFile(roots, t);
    return [car];
  }

  async prepareCarFiles(rootBlock: AnyBlock, t: CarTransaction, isPublic: boolean): Promise<{ cid: AnyLink; bytes: Uint8Array }[]> {
    const theKey = isPublic ? undefined : await this._getKey();
    const carFiles: { cid: AnyLink; bytes: Uint8Array }[] = [];
    const threshold = this.ebOpts.threshold || 1000 * 1000;
    let clonedt = new CarTransaction(t.parent, { add: false });
    clonedt.putSync(rootBlock.cid, rootBlock.bytes);
    let newsize = CBW.blockLength(toCIDBlock(rootBlock));
    let cidRootBlock = rootBlock;
    for (const { cid, bytes } of t.entries()) {
      newsize += CBW.blockLength(toCIDBlock({ cid: cid, bytes }));
      if (newsize >= threshold) {
        carFiles.push(await this.createCarFile(theKey, cidRootBlock.cid, clonedt));
        clonedt = new CarTransaction(t.parent, { add: false });
        clonedt.putSync(cid, bytes);
        cidRootBlock = { cid, bytes };
        newsize = CBW.blockLength(toCIDBlock({ cid, bytes })); //+ CBW.blockLength(rootBlock)
      } else {
        clonedt.putSync(cid, bytes);
      }
    }
    carFiles.push(await this.createCarFile(theKey, cidRootBlock.cid, clonedt));
    // console.log("split to ", carFiles.length, "files")
    return carFiles;
  }

  private async createCarFile(
    theKey: string | undefined,
    cid: AnyLink,
    t: CarTransaction,
  ): Promise<{ cid: AnyLink; bytes: Uint8Array }> {
    return theKey && this.ebOpts.crypto
      ? await encryptedEncodeCarFile(this.ebOpts.crypto, theKey, cid, t)
      : await encodeCarFile([cid], t);
  }

  protected makeFileCarHeader(result: TransactionMeta): TransactionMeta {
    const files: AnyLink[] = [];
    for (const [, meta] of Object.entries(result.files || {})) {
      if (meta && typeof meta === "object" && "cid" in meta && meta !== null) {
        files.push(meta.cid as AnyLink);
      }
    }
    return { ...result, files };
  }

  async updateCarLog<T>(cids: CarGroup, fp: CarHeader<T>, compact: boolean): Promise<void> {
    if (compact) {
      const previousCompactCid = fp.compact[fp.compact.length - 1];
      fp.compact.map((c) => c.toString()).forEach(this.seenCompacted.add, this.seenCompacted);
      this.carLog = [...uniqueCids([...this.carLog, ...fp.cars, cids], this.seenCompacted)];
      void this.removeCidsForCompact(previousCompactCid[0]);
    } else {
      this.carLog.unshift(cids);
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
    await this.ready;
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
          if (!reader) throw new Error(`missing car reader ${cid.toString()}`);
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
    await this.ready;
    const sCid = cid.toString();
    if (this.getBlockCache.has(sCid)) return this.getBlockCache.get(sCid);

    const getCarCid = async (carCid: AnyLink) => {
      if (this.getBlockCache.has(sCid)) return this.getBlockCache.get(sCid);
      const reader = await this.loadCar(carCid);
      if (!reader) {
        throw new Error(`missing car reader ${carCid.toString()}`);
      }
      await this.cacheCarReader(carCid.toString(), reader).catch(() => {
        return;
      });
      if (this.getBlockCache.has(sCid)) return this.getBlockCache.get(sCid);
      throw new Error(`block not in reader: ${cid.toString()}`);
    };

    const getCompactCarCids = async (carCid: AnyLink) => {
      // console.log("getCompactCarCids", carCid.toString())

      const reader = await this.loadCar(carCid);
      if (!reader) {
        throw new Error(`missing car reader ${carCid.toString()}`);
      }

      const header = await parseCarFile(reader);

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
      throw new Error(`block not in compact reader: ${cid.toString()}`);
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

  protected makeCarHeader<T>(result: T, cars: CarLog, compact = false): CarHeader<T> {
    const coreHeader = compact ? { cars: [], compact: cars } : { cars, compact: [] };
    return { ...coreHeader, meta: result };
  }

  async loadCar(cid: AnyLink | AnyLink[]): Promise<CarReader> {
    if (!this.carStore) {
      throw new Error("car store not initialized");
    }
    const loaded = await this.storesLoadCar(cid, await this.carStore(), this.remoteCarStore);
    return loaded;
  }

  //What if instead it returns an Array of CarHeader
  protected async storesLoadCar(
    cid: AnyLink | AnyLink[],
    local: AbstractDataStore,
    remote?: AbstractDataStore,
    publicFiles?: boolean,
  ): Promise<CarReader> {
    const cidsString = cid.toString();
    if (!this.carReaders.has(cidsString)) {
      this.carReaders.set(
        cidsString,
        (async () => {
          let loadedCar: AnyBlock | undefined = undefined;
          try {
            //loadedCar now is an array of AnyBlocks
            loadedCar = await local.load(cid);
          } catch (e) {
            if (remote) {
              const remoteCar = await remote.load(cid);
              if (remoteCar) {
                // todo test for this
                await local.save(remoteCar);
                loadedCar = remoteCar;
              }
            }
          }
          if (!loadedCar) throw new Error(`missing car files ${cidsString}`);
          //This needs a fix as well as the fromBytes function expects a Uint8Array
          //Either we can merge the bytes or return an array of rawReaders
          const rawReader = await CarReader.fromBytes(loadedCar.bytes);
          const readerP = publicFiles ? Promise.resolve(rawReader) : this.ensureDecryptedReader(rawReader);

          const cachedReaderP = readerP.then(async (reader) => {
            await this.cacheCarReader(cidsString, reader).catch(() => {
              return;
            });
            return reader;
          });
          this.carReaders.set(cidsString, cachedReaderP);
          return readerP;
        })().catch((e) => {
          this.carReaders.delete(cidsString);
          throw e;
        }),
      );
    }
    return this.carReaders.get(cidsString) as Promise<CarReader>;
  }

  protected async ensureDecryptedReader(reader: CarReader): Promise<CarReader> {
    const theKey = await this._getKey();
    if (this.ebOpts.public || !(theKey && this.ebOpts.crypto)) {
      console.log("no key or crypto", this.ebOpts.public, theKey, this.ebOpts.crypto);
      return reader;
    }
    const { blocks, root } = await decodeEncryptedCar(this.ebOpts.crypto, theKey, reader);
    return {
      getRoots: () => [root],
      get: blocks.get.bind(blocks),
      blocks: blocks.entries.bind(blocks),
    } as unknown as CarReader;
  }

  protected async setKey(key: string) {
    if (this.key && this.key !== key) throw new Error("key mismatch");
    this.key = key;
    const encoder = new TextEncoder();
    const data = encoder.encode(key);
    const hashBuffer = await this.ebOpts.crypto.digestSHA256(data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    this.keyId = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  protected async getMoreReaders(cids: AnyLink[]) {
    const limit = pLimit(5);
    const missing = cids.filter((cid) => !this.carReaders.has(cid.toString()));
    await Promise.all(missing.map((cid) => limit(() => this.loadCar(cid))));
  }

  async _setWaitForWrite(_writingFn: () => Promise<unknown>): Promise<void> {
    const wr = this.writing;
    this.writing = wr.then(async () => {
      await _writingFn();
      return wr;
    });
    return this.writing.then(() => {
      return;
    });
  }
}

export interface Connection {
  loader: Loader | null;
  loaded: Promise<void>;
  connectMeta({ loader }: { loader: Loader | null }): void;
  connectStorage({ loader }: { loader: Loader | null }): void;

  metaUpload(bytes: Uint8Array, params: UploadMetaFnParams): Promise<Uint8Array[] | null>;
  dataUpload(bytes: Uint8Array, params: UploadDataFnParams, opts?: { public?: boolean }): Promise<void>;
  metaDownload(params: DownloadMetaFnParams): Promise<Uint8Array[] | null>;
  dataDownload(params: DownloadDataFnParams): Promise<Uint8Array | null>;
}

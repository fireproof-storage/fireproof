import { FileTransactionMeta } from "../types";
import { CarTransaction } from "./transaction";
import {
  AnyBlock,
  AnyLink,
  CarGroup,
  CarHeader,
  CarLog,
  CarMakeable,
  CommitOpts,
  DataStore,
  DbMeta,
  MetaStore,
  toCIDBlock,
  TransactionMeta,
  WALStore,
} from "./types";
import * as CBW from "@ipld/car/buffer-writer";
import { CID, BlockEncoder } from "multiformats";
import { encode } from "../runtime/wait-pr-multiformats/block.js";
import { sha256 as hasher } from "multiformats/hashes/sha2";
import * as dagCodec from "@ipld/dag-cbor";
async function encodeCarFile(roots: AnyLink[], t: CarMakeable, codec: BlockEncoder<number, Uint8Array>): Promise<AnyBlock> {
  let size = 0;
  const headerSize = CBW.headerLength({ roots } as { roots: CID<unknown, number, number, 1>[] });
  size += headerSize;
  for (const { cid, bytes } of t.entries()) {
    size += CBW.blockLength({ cid, bytes } as CBW.Block);
  }
  const buffer = new Uint8Array(size);
  const writer = CBW.createWriter(buffer, { headerSize });

  for (const r of roots) {
    writer.addRoot(r as CID<unknown, number, number, 1>);
  }

  for (const { cid, bytes } of t.entries()) {
    writer.write({ cid, bytes } as CBW.Block);
  }
  writer.close();
  return await encode({ value: writer.bytes, hasher, codec });
}

export async function createCarFile(
  encoder: BlockEncoder<number, Uint8Array>,
  cid: AnyLink,
  t: CarTransaction,
): Promise<{ cid: AnyLink; bytes: Uint8Array }> {
  // try {
  return encodeCarFile([cid], t, encoder);
  //   const keycr = await store.keyedCrypto()
  //   return keycr.isEncrypting
  //     ? await encryptedEncodeCarFile(this.logger, keycr, cid, t)
  //     : await encodeCarFile([cid], t);
  // } catch (e) {
  // throw store.logger.Error().Err(e).Msg("error creating car file").AsError();
  // }
}

export async function commitFiles(
  fileStore: DataStore,
  walStore: WALStore,
  t: CarTransaction,
  done: TransactionMeta,
  // opts: CommitOpts = { noLoader: false, compact: false },
): Promise<CarGroup> {
  const { files: roots } = makeFileCarHeader(done as FileTransactionMeta) as {
    files: AnyLink[];
  };
  const cids: AnyLink[] = [];
  // const fileStore = await this.fileStore();
  const codec = (await fileStore.keyedCrypto()).codec();
  const cars = await prepareCarFilesFiles(codec, roots, t);
  for (const car of cars) {
    const { cid, bytes } = car;
    // real deal
    await fileStore.save({ cid, bytes });
    await walStore.enqueueFile(cid /*, !!opts.public*/);
    cids.push(cid);
  }
  return cids;
}

function makeFileCarHeader(result: FileTransactionMeta): TransactionMeta {
  const files: AnyLink[] = [];
  for (const [, meta] of Object.entries(result.files || {})) {
    if (meta && typeof meta === "object" && "cid" in meta && meta !== null) {
      files.push(meta.cid as AnyLink);
    }
  }
  return { ...result, files };
}

async function prepareCarFilesFiles(
  encoder: BlockEncoder<number, Uint8Array>,
  roots: AnyLink[],
  t: CarTransaction,
  // isPublic: boolean,
): Promise<{ cid: AnyLink; bytes: Uint8Array }[]> {
  // const theKey = isPublic ? null : await this._getKey();
  // const kc = await store.keyedCrypto()
  // const car = kc.isEncrypting
  //   ? await encryptedEncodeCarFile(this.logger, kc, roots[0], t)
  //   : await encodeCarFile(roots, t);
  return [await encodeCarFile(roots, t, encoder)];
}

// PUR Commit

function makeCarHeader<T>(meta: T, cars: CarLog, compact = false): CarHeader<T> {
  const coreHeader = compact ? { cars: [], compact: cars } : { cars, compact: [] };
  return { ...coreHeader, meta };
}

async function encodeCarHeader<T>(fp: CarHeader<T>) {
  return (await encode({
    value: { fp },
    hasher,
    codec: dagCodec,
  })) as AnyBlock;
}

export interface CommitParams {
  readonly encoder: BlockEncoder<number, Uint8Array>;
  readonly carLog: CarLog;
  readonly carStore: DataStore;
  readonly WALStore: WALStore;
  readonly metaStore: MetaStore;
  readonly threshold?: number;
}

export async function commit<T>(
  params: CommitParams,
  t: CarTransaction,
  done: T,
  opts: CommitOpts = { noLoader: false, compact: false },
): Promise<{ cgrp: CarGroup; header: CarHeader<T> }> {
  const fp = makeCarHeader<T>(done, params.carLog, !!opts.compact);
  const rootBlock = await encodeCarHeader(fp);

  const cars = await prepareCarFiles(params.encoder, params.threshold, rootBlock, t);
  const cids: AnyLink[] = [];
  for (const car of cars) {
    const { cid, bytes } = car;
    await params.carStore.save({ cid, bytes });
    cids.push(cid);
  }

  // await this.cacheTransaction(t);
  const newDbMeta = { cars: cids } as DbMeta;
  await params.WALStore.enqueue(newDbMeta, opts);
  await params.metaStore.save(newDbMeta);
  return { cgrp: cids, header: fp };
}

async function prepareCarFiles(
  encoder: BlockEncoder<number, Uint8Array>,
  threshold: number | undefined,
  rootBlock: AnyBlock,
  t: CarTransaction,
): Promise<{ cid: AnyLink; bytes: Uint8Array }[]> {
  // const theKey = isPublic ? undefined : await this._getKey();
  const carFiles: { cid: AnyLink; bytes: Uint8Array }[] = [];
  threshold = threshold || 1000 * 1000;
  let clonedt = new CarTransaction(t.parent, { add: false });
  clonedt.putSync(rootBlock.cid, rootBlock.bytes);
  let newsize = CBW.blockLength(toCIDBlock(rootBlock));
  let cidRootBlock = rootBlock;
  for (const { cid, bytes } of t.entries()) {
    newsize += CBW.blockLength(toCIDBlock({ cid: cid, bytes }));
    if (newsize >= threshold) {
      carFiles.push(await createCarFile(encoder, cidRootBlock.cid, clonedt));
      clonedt = new CarTransaction(t.parent, { add: false });
      clonedt.putSync(cid, bytes);
      cidRootBlock = { cid, bytes };
      newsize = CBW.blockLength(toCIDBlock({ cid, bytes })); //+ CBW.blockLength(rootBlock)
    } else {
      clonedt.putSync(cid, bytes);
    }
  }
  // HEREMENO
  carFiles.push(await createCarFile(encoder, cidRootBlock.cid, clonedt));
  // console.log("split to ", carFiles.length, "files")
  return carFiles;
}

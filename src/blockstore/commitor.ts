import { FileTransactionMeta, CarTransaction } from "../types.js";
import {
  AnyBlock,
  AnyLink,
  CarGroup,
  CarHeader,
  CarLog,
  CarMakeable,
  CarStore,
  CommitOpts,
  DbMeta,
  FileStore,
  FroozenCarLog,
  MetaStore,
  toCIDBlock,
  TransactionMeta,
  WALStore,
} from "./types.js";
import * as CBW from "@ipld/car/buffer-writer";
import { ByteView, CID } from "multiformats";
import { encode } from "../runtime/wait-pr-multiformats/block.js";
import { AsyncBlockEncoder } from "../runtime/wait-pr-multiformats/codec-interface.js";
// import { sha256 as hasher } from "multiformats/hashes/sha2";
import * as dagCodec from "@ipld/dag-cbor";
import { CarTransactionImpl } from "./transaction.js";
import { sha256 } from "multiformats/hashes/sha2";

async function encodeCarFile(
  roots: AnyLink[],
  t: CarMakeable,
  codec: AsyncBlockEncoder<24, ByteView<Uint8Array>>,
): Promise<AnyBlock> {
  let size = 0;
  const headerSize = CBW.headerLength({ roots } as { roots: CID<unknown, number, number, 1>[] });
  size += headerSize;
  for await (const { cid, bytes } of t.entries()) {
    size += CBW.blockLength({ cid, bytes } as CBW.Block);
  }
  const buffer = new Uint8Array(size);
  const writer = CBW.createWriter(buffer.buffer, { headerSize });

  for (const r of roots) {
    writer.addRoot(r as CID<unknown, number, number, 1>);
  }

  for await (const { cid, bytes } of t.entries()) {
    writer.write({ cid, bytes } as CBW.Block);
  }
  writer.close();
  return await encode({ value: writer.bytes, hasher: sha256, codec });
}

export async function createCarFile(
  encoder: AsyncBlockEncoder<24, Uint8Array>,
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
  fileStore: FileStore,
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
  const codec = await fileStore.keyedCrypto().then((i) => i.codec());
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
  encoder: AsyncBlockEncoder<24, Uint8Array>,
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
  const coreHeader = compact
    ? { cars: [] as FroozenCarLog, compact: cars.asArray() }
    : { cars: cars.asArray(), compact: [] as FroozenCarLog };
  return { ...coreHeader, meta };
}

async function encodeCarHeader<T>(fp: CarHeader<T>) {
  return (await encode({
    value: { fp },
    hasher: sha256,
    codec: dagCodec,
  })) as AnyBlock;
}

export interface CommitParams {
  readonly encoder: AsyncBlockEncoder<24, Uint8Array>;
  readonly carLog: CarLog;
  readonly carStore: CarStore;
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
  console.log(
    "commit-root",
    rootBlock.cid.toString(),
    fp,
    cars.map((c) => c.cid.toString()),
  );
  const cids: AnyLink[] = [];
  // console.log("committing", cars.map((c) => c.cid.toString()));
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
  encoder: AsyncBlockEncoder<24, Uint8Array>,
  threshold: number | undefined,
  rootBlock: AnyBlock,
  t: CarTransaction,
): Promise<{ cid: AnyLink; bytes: Uint8Array }[]> {
  // const theKey = isPublic ? undefined : await this._getKey();
  const carFiles: { cid: AnyLink; bytes: Uint8Array }[] = [];
  threshold = threshold || 16 * 65536;
  let clonedt = new CarTransactionImpl(t.parent, { add: false, noLoader: false });
  console.log("prepareCarFiles-root", rootBlock.cid.toString());
  clonedt.putSync(rootBlock.cid, rootBlock.bytes);
  let newsize = CBW.blockLength(toCIDBlock(rootBlock));
  let cidRootBlock = rootBlock;
  for await (const { cid, bytes } of t.entries()) {
    newsize += CBW.blockLength(toCIDBlock({ cid: cid, bytes }));
    // console.log("prepareCarFiles", cid.toString())
    if (newsize >= threshold) {
      carFiles.push(await createCarFile(encoder, cidRootBlock.cid, clonedt));
      clonedt = new CarTransactionImpl(t.parent, { add: false, noLoader: false });
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

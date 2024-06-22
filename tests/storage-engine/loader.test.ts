import * as codec from "@ipld/dag-cbor";
import { sha256 as hasher } from "multiformats/hashes/sha2";
import { encode } from "multiformats/block";
import { CID } from "multiformats/cid";

import { assert, matches, equals, resetDirectory, dataDir } from "../fireproof/helpers";

import { parseCarFile } from "../../src/storage-engine/loader-helpers";

import { CarTransaction, CompactionFetcher, EncryptedBlockstore, Loader } from "../../src/storage-engine/index";

import { MemoryBlockstore } from "@web3-storage/pail/block";

import { BlockView } from "multiformats";
import { AnyAnyLink, AnyLink, CarGroup, IndexTransactionMeta, TransactionMeta } from "../../src/storage-engine/types";

describe("basic Loader", function () {
  let loader: Loader;
  let block: BlockView;
  let t: CarTransaction;

  beforeEach(async function () {
    await resetDirectory(dataDir, "test-loader-commit");
    const mockM = new MyMemoryBlockStore();
    t = new CarTransaction(mockM as EncryptedBlockstore);
    loader = new Loader("test-loader-commit", { public: true });
    block = await encode({
      value: { hello: "world" },
      hasher,
      codec,
    });
    await t.put(block.cid, block.bytes);
    await mockM.put(block.cid, block.bytes);
  });
  it("should have an empty car log", function () {
    equals(loader.carLog.length, 0);
  });
  it("should commit", async function () {
    const carGroup = await loader.commit(t, { head: [block.cid] });
    equals(loader.carLog.length, 1);
    const reader = await loader.loadCar(carGroup[0]);
    assert(reader);
    const parsed = await parseCarFile<TransactionMeta>(reader);
    assert(parsed.cars);
    equals(parsed.cars.length, 0);
    assert(parsed.meta);
    assert(parsed.meta.head);
  });
});

// function sleep(ms: number) {
//   return new Promise((resolve) => setTimeout(resolve, ms));
// }

class MyMemoryBlockStore extends EncryptedBlockstore {
  readonly memblock = new MemoryBlockstore();
  constructor() {
    const ebOpts = {
      name: "MyMemoryBlockStore",
    };
    super(ebOpts);
    this.ready = Promise.resolve();
  }
  readonly ready: Promise<void>;
  get loader(): Loader {
    return new Loader("MyMemoryBlockStore", {});
  }
  readonly transactions = new Set<CarTransaction>();
  // readonly lastTxMeta?: TransactionMeta;
  readonly compacting: boolean = false;

  override async put(cid: AnyAnyLink, block: Uint8Array): Promise<void> {
    return this.memblock.put(cid, block);
  }

  // transaction<M ext(fn: (t: CarTransaction) => Promise<MetaType>, opts?: { noLoader: boolean }): Promise<MetaType> {
  //   throw new Error("Method not implemented.");
  // }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getFile(car: AnyLink, cid: AnyLink, isPublic?: boolean): Promise<Uint8Array> {
    throw new Error("Method not implemented.");
  }
  compact(): Promise<void> {
    throw new Error("Method not implemented.");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  defaultCompact(blocks: CompactionFetcher): Promise<TransactionMeta> {
    throw new Error("Method not implemented.");
  }
}

describe("basic Loader with two commits", function () {
  let loader: Loader;
  let block: BlockView;
  let block2: BlockView;
  let block3: BlockView;
  let block4: BlockView;
  let t: CarTransaction;
  let carCid: CarGroup;
  let carCid0: CarGroup;

  beforeEach(async function () {
    await resetDirectory(dataDir, "test-loader-two-commit");
    const mockM = new MyMemoryBlockStore();
    t = new CarTransaction(mockM);
    loader = new Loader("test-loader-two-commit", { public: true });
    block = await encode({
      value: { hello: "world" },
      hasher,
      codec,
    });
    await t.put(block.cid, block.bytes);
    carCid0 = await loader.commit(t, { head: [block.cid] });

    block2 = await encode({
      value: { hello: "universe" },
      hasher,
      codec,
    });

    await t.put(block2.cid, block2.bytes);
    carCid = await loader.commit(t, { head: [block2.cid] });

    block3 = await encode({
      value: { hello: "multiverse" },
      hasher,
      codec,
    });

    await t.put(block3.cid, block3.bytes);

    block4 = await encode({
      value: { hello: "megaverse" },
      hasher,
      codec,
    });

    await t.put(block4.cid, block4.bytes);
  });

  it("should have a car log", function () {
    equals(loader.carLog.length, 2);
    equals(loader.carLog[0].toString(), carCid.toString());
    equals(loader.carLog[1].toString(), carCid0.toString());
  });

  it("should commit", async function () {
    const reader = await loader.loadCar(carCid[0]);
    assert(reader);
    const parsed = await parseCarFile<TransactionMeta>(reader);
    assert(parsed.cars);
    equals(parsed.compact.length, 0);
    equals(parsed.cars.length, 1);
    assert(parsed.meta);
    assert(parsed.meta.head);
  });

  it("should compact", async function () {
    const compactCid = await loader.commit(t, { head: [block2.cid] }, { compact: true });
    equals(loader.carLog.length, 1);

    const reader = await loader.loadCar(compactCid[0]);
    assert(reader);
    const parsed = await parseCarFile<TransactionMeta>(reader);
    assert(parsed.cars);
    equals(parsed.compact.length, 2);
    equals(parsed.cars.length, 0);
    assert(parsed.meta);
    assert(parsed.meta.head);
  });

  it("compact should erase old files", async function () {
    await loader.commit(t, { head: [block2.cid] }, { compact: true });
    equals(loader.carLog.length, 1);
    await loader.commit(t, { head: [block3.cid] }, { compact: false });
    equals(loader.carLog.length, 2);
    assert(await (await loader.carStore()).load(carCid[0]));
    await loader.commit(t, { head: [block3.cid] }, { compact: true });
    equals(loader.carLog.length, 1);
    assert(await (await loader.carStore()).load(carCid[0]));
    await loader.commit(t, { head: [block4.cid] }, { compact: false });
    equals(loader.carLog.length, 2);

    const e = await loader.loadCar(carCid[0]).catch((e) => e);
    assert(e);
    matches(e.message, "missing car file");
  }, 10000);
});

describe("basic Loader with index commits", function () {
  let block: BlockView;
  let ib: EncryptedBlockstore;
  let indexerResult: IndexTransactionMeta;
  let cid: CID;
  // let indexMap: Map<string, CID>;

  beforeEach(async function () {
    await resetDirectory(dataDir, "test-loader-index");
    // t = new CarTransaction()
    ib = new EncryptedBlockstore({ name: "test-loader-index" });
    block = await encode({
      value: { hello: "world" },
      hasher,
      codec,
    });
    // console.log('block', block.cid)

    cid = CID.parse("bafybeia4luuns6dgymy5kau5rm7r4qzrrzg6cglpzpogussprpy42cmcn4");
    indexerResult = {
      indexes: {
        hello: {
          byId: cid,
          byKey: cid,
          head: [cid],
          name: "hello",
          map: "(doc) => doc.hello",
        },
      },
    };
    // indexMap = new Map();
  });

  it("should start with an empty car log", function () {
    assert(ib.loader);
    equals(ib.loader.carLog.length, 0);
  });

  it("should commit the index metadata", async function () {
    const { cars: carCid } = await ib.transaction<IndexTransactionMeta>(
      async (t) => {
        await t.put(block.cid, block.bytes);
        return indexerResult;
      } /* , indexMap */,
    );

    assert(carCid);
    assert(ib.loader);
    const carLog = ib.loader.carLog;

    equals(carLog.length, 1);
    const reader = await ib.loader.loadCar(carCid[0]);
    assert(reader);
    const parsed = await parseCarFile<IndexTransactionMeta>(reader);
    assert(parsed.cars);
    equals(parsed.cars.length, 0);
    assert(parsed.meta);
    assert(parsed.meta.indexes);
    const indexes = parsed.meta.indexes;
    assert(indexes);
    assert(indexes.hello);
    equals(indexes.hello.map, "(doc) => doc.hello");
    equals(indexes.hello.name, "hello");
  });
});

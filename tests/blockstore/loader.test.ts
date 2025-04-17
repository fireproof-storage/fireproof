import * as codec from "@ipld/dag-cbor";
import { sha256 as hasher } from "multiformats/hashes/sha2";
import { CID } from "multiformats/cid";
import { CRDTMeta, CarTransaction, IndexTransactionMeta, SuperThis, bs, ensureSuperThis, rt } from "@fireproof/core";
import { simpleBlockOpts } from "../helpers.js";
import { FPBlock, isBlockItemReady, isBlockItemStale } from "../../src/blockstore/index.js";
import { anyBlock2FPBlock } from "../../src/blockstore/loader-helpers.js";

class MyMemoryBlockStore extends bs.EncryptedBlockstore {
  readonly memblock = new Map<string, FPBlock>();
  loader: bs.Loader;
  constructor(sthis: SuperThis) {
    const ebOpts = simpleBlockOpts(sthis, "MyMemoryBlockStore"); //, "MyMemoryBlockStore");
    // const ebOpts = {
    //   name: "MyMemoryBlockStore",
    // } as bs.BlockstoreOpts;
    super(sthis, ebOpts);
    this.loader = new bs.Loader(sthis, ebOpts);
  }
  ready(): Promise<void> {
    return Promise.resolve();
  }
  close(): Promise<void> {
    return this.loader.close();
  }
  readonly transactions = new Set<CarTransaction>();
  // readonly lastTxMeta?: TransactionMeta;
  readonly compacting: boolean = false;

  override async put(fp: FPBlock): Promise<void> {
    this.memblock.set(fp.cid.toString(), fp);
  }

  // transaction<M ext(fn: (t: CarTransaction) => Promise<MetaType>, opts?: { noLoader: boolean }): Promise<MetaType> {
  //   throw new Error("Method not implemented.");
  // }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getFile(car: bs.AnyLink, cid: bs.AnyLink, isPublic?: boolean): Promise<Uint8Array> {
    throw new Error("Method not implemented.");
  }
  compact(): Promise<void> {
    throw new Error("Method not implemented.");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  defaultCompact(blocks: bs.CompactionFetcher): Promise<bs.TransactionMeta> {
    throw new Error("Method not implemented.");
  }
}

describe("basic Loader simple", function () {
  let loader: bs.Loader;
  let block: FPBlock;
  let t: CarTransaction;
  const sthis = ensureSuperThis();

  afterEach(async () => {
    await loader.close();
    await loader.destroy();
  });

  beforeEach(async () => {
    const testDbName = "test-loader-commit";
    await sthis.start();
    const mockM = new MyMemoryBlockStore(sthis);
    t = new bs.CarTransactionImpl(mockM as bs.EncryptedBlockstore);
    loader = new bs.Loader(sthis, {
      ...simpleBlockOpts(sthis, testDbName),
      public: true,
    });
    await loader.ready();
    block = await anyBlock2FPBlock(
      await rt.mf.block.encode({
        value: { hello: "world" },
        hasher,
        codec,
      }),
    );
    await t.put(block);
    await mockM.put(block);
  });
  it("should have an empty car log", function () {
    expect(loader.carLog.length).toBe(0);
  });
  it("should commit", async () => {
    const carGroup = await loader.commit(t, { head: [block.cid] });
    expect(loader.carLog.length).toBe(1);
    const reader = await loader.loadCar(carGroup[0], loader.attachedStores.local());
    assert(isBlockItemReady(reader));
    expect(reader).toBeTruthy();
    const parsed = await bs.parseCarFile<CRDTMeta>(reader, loader.logger);
    expect(parsed.cars).toBeTruthy();
    expect(parsed.cars.length).toBe(0);
    expect(parsed.meta).toBeTruthy();
    expect(parsed.meta.head).toBeTruthy();
  });
});

describe("basic Loader with two commits", function () {
  let loader: bs.Loader;
  let block: FPBlock;
  let block2: FPBlock;
  let block3: FPBlock;
  let block4: FPBlock;
  let t: CarTransaction;
  let carCid: bs.CarGroup;
  let carCid0: bs.CarGroup;

  const sthis = ensureSuperThis();

  afterEach(async () => {
    await loader.close();
    await loader.destroy();
  });

  beforeEach(async () => {
    await sthis.start();
    const mockM = new MyMemoryBlockStore(sthis);
    t = new bs.CarTransactionImpl(mockM);
    loader = new bs.Loader(sthis, {
      ...simpleBlockOpts(sthis, "test-loader-two-commit"),
      public: true,
    });
    await loader.ready();

    block = await anyBlock2FPBlock(
      await rt.mf.block.encode({
        value: { hello: "world" },
        hasher,
        codec,
      }),
    );
    await t.put(block);
    carCid0 = await loader.commit(t, { head: [block.cid] });

    block2 = await anyBlock2FPBlock(
      await rt.mf.block.encode({
        value: { hello: "universe" },
        hasher,
        codec,
      }),
    );
    await t.put(block2);
    carCid = await loader.commit(t, { head: [block2.cid] });

    block3 = await anyBlock2FPBlock(
      await rt.mf.block.encode({
        value: { hello: "multiverse" },
        hasher,
        codec,
      }),
    );
    await t.put(block3);

    block4 = await anyBlock2FPBlock(
      await rt.mf.block.encode({
        value: { hello: "megaverse" },
        hasher,
        codec,
      }),
    );

    await t.put(block4);
  });

  it("should have a car log", function () {
    expect(loader.carLog.length).toBe(2);
    expect(loader.carLog.asArray()[0].toString()).toBe(carCid.toString());
    expect(loader.carLog.asArray()[1].toString()).toBe(carCid0.toString());
  });

  it("should commit", async () => {
    const reader = await loader.loadCar(carCid[0], loader.attachedStores.local());
    expect(reader).toBeTruthy();
    assert(isBlockItemReady(reader));
    const parsed = await bs.parseCarFile<CRDTMeta>(reader, loader.logger);
    expect(parsed.cars).toBeTruthy();
    expect(parsed.compact.length).toBe(0);
    expect(parsed.cars.length).toBe(1);
    expect(parsed.meta).toBeTruthy();
    expect(parsed.meta.head).toBeTruthy();
  });

  it("should compact", async () => {
    const compactCid = await loader.commit(t, { head: [block2.cid] }, { compact: true });
    expect(loader.carLog.length).toBe(1);

    const reader = await loader.loadCar(compactCid[0], loader.attachedStores.local());
    expect(reader).toBeTruthy();
    assert(isBlockItemReady(reader));
    const parsed = await bs.parseCarFile<CRDTMeta>(reader, loader.logger);
    expect(parsed.cars).toBeTruthy();
    expect(parsed.compact.length).toBe(2);
    expect(parsed.cars.length).toBe(0);
    expect(parsed.meta).toBeTruthy();
    expect(parsed.meta.head).toBeTruthy();
  });

  it("compact should erase old files", async () => {
    const cs = await loader.attachedStores.local().active.car;
    await loader.commit(t, { head: [block2.cid] }, { compact: true });
    expect(loader.carLog.length).toBe(1);
    await loader.commit(t, { head: [block3.cid] }, { compact: false });
    expect(loader.carLog.length).toBe(2);
    expect(await cs.load(carCid[0])).toBeTruthy();
    await loader.commit(t, { head: [block3.cid] }, { compact: true });
    expect(loader.carLog.length).toBe(1);
    const e0 = await cs.load(carCid[0]).catch((e) => e);
    expect(e0 instanceof Error).toBeTruthy();
    await loader.commit(t, { head: [block4.cid] }, { compact: false });
    expect(loader.carLog.length).toBe(2);

    const e = await loader.loadCar(carCid[0], loader.attachedStores.local());
    expect(e).toBeTruthy();
    assert(isBlockItemStale(e));
    expect(e.item.status).toBe("stale");
    expect(e.item.statusCause.message).toMatch(/(missing car file)|(not found)/);
  }, 10000);
});

describe("basic Loader with index commits", function () {
  let block: FPBlock;
  let ib: bs.EncryptedBlockstore;
  let indexerResult: IndexTransactionMeta;
  let cid: CID;
  // let indexMap: Map<string, CID>;
  const sthis = ensureSuperThis();

  afterEach(async () => {
    await ib.close();
    await ib.destroy();
  });

  beforeEach(async () => {
    const name = "test-loader-index" + Math.random();
    await sthis.start();
    // t = new CarTransaction()
    ib = new bs.EncryptedBlockstore(sthis, simpleBlockOpts(sthis, name));
    await ib.ready();
    block = await anyBlock2FPBlock(
      await rt.mf.block.encode({
        value: { hello: "world" },
        hasher,
        codec,
      }),
    );
    // console.log('block', block.cid)

    cid = CID.parse("bafybeia4luuns6dgymy5kau5rm7r4qzrrzg6cglpzpogussprpy42cmcn4");
    indexerResult = {
      indexes: {
        hello: {
          byId: cid,
          byKey: cid,
          head: [cid as CID<unknown, number, number, 1>],
          name: "hello",
          map: "(doc) => doc.hello",
        },
      },
    };
    // indexMap = new Map();
  });

  it("should start with an empty car log", function () {
    expect(ib.loader).toBeTruthy();
    expect(ib.loader.carLog.length).toBe(0);
  });

  it("should commit the index metadata", async () => {
    const { cars: carCid } = await ib.transaction<IndexTransactionMeta>(
      async (t) => {
        await t.put(block);
        return indexerResult;
      } /* , indexMap */,
    );

    expect(carCid).toBeTruthy();
    expect(ib.loader).toBeTruthy();
    const carLog = ib.loader.carLog;

    expect(carLog.length).toBe(1);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const reader = await ib.loader.loadCar(carCid![0], ib.loader.attachedStores.local());
    expect(reader).toBeTruthy();
    assert(isBlockItemReady(reader));
    const parsed = await bs.parseCarFile<IndexTransactionMeta>(reader, sthis.logger);
    expect(parsed.cars).toBeTruthy();
    expect(parsed.cars.length).toBe(0);
    expect(parsed.meta).toBeTruthy();
    expect(parsed.meta.indexes).toBeTruthy();
    const indexes = parsed.meta.indexes;
    expect(indexes).toBeTruthy();
    expect(indexes.hello).toBeTruthy();
    expect(indexes.hello.map).toBe("(doc) => doc.hello");
    expect(indexes.hello.name).toBe("hello");
  });
});

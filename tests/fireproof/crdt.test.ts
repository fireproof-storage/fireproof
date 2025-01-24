import { CRDT, defaultWriteQueueOpts, ensureSuperThis, LedgerOpts, toStoreURIRuntime, rt, CRDTImpl } from "@fireproof/core";
import { bs } from "@fireproof/core";
import { CRDTMeta, DocValue } from "@fireproof/core";
import { Index, index } from "@fireproof/core";

describe("Fresh crdt", function () {
  let crdt: CRDT;
  const sthis = ensureSuperThis();
  afterEach(async function () {
    await crdt.close();
    await crdt.destroy();
  });
  beforeEach(async function () {
    await sthis.start();
    const dbOpts: LedgerOpts = {
      writeQueue: defaultWriteQueueOpts({}),
      keyBag: rt.defaultKeyBagOpts(sthis),
      storeUrls: toStoreURIRuntime(sthis, "test-crdt-cold"),
      storeEnDe: bs.ensureStoreEnDeFile({}),
    };
    crdt = new CRDTImpl(sthis, dbOpts);
  });
  it("should have an empty head", async function () {
    const head = crdt.clock.head;
    expect(head.length).toBe(0);
  });
  it("should accept put and return results", async function () {
    const didPut = await crdt.bulk([{ id: "hello", value: { hello: "world" } }]);
    const head = didPut.head;
    expect(head.length).toBe(1);
  });
  it("should accept multi-put and return results", async function () {
    const didPut = await crdt.bulk([
      { id: "ace", value: { points: 11 } },
      { id: "king", value: { points: 10 } },
    ]);
    const head = didPut.head;
    expect(head.length).toBe(1);
  });
});

describe("CRDT with one record", function () {
  interface CRDTTestType {
    readonly hello: string;
    readonly nice: string;
  }
  let crdt: CRDT;
  let firstPut: CRDTMeta;
  const sthis = ensureSuperThis();

  afterEach(async function () {
    await crdt.close();
    await crdt.destroy();
  });

  beforeEach(async function () {
    await sthis.start();
    const dbOpts: LedgerOpts = {
      writeQueue: defaultWriteQueueOpts({}),
      keyBag: rt.defaultKeyBagOpts(sthis),
      storeUrls: toStoreURIRuntime(sthis, `test@${sthis.nextId().str}`),
      storeEnDe: bs.ensureStoreEnDeFile({}),
    };
    crdt = new CRDTImpl(sthis, dbOpts);
    firstPut = await crdt.bulk([{ id: "hello", value: { hello: "world" } }]);
  });
  it("should have a one-element head", async function () {
    const head = crdt.clock.head;
    expect(head.length).toBe(1);
  });
  it("should return the head", async function () {
    expect(firstPut.head.length).toBe(1);
  });
  it("return the record on get", async function () {
    const got = (await crdt.get("hello")) as DocValue<CRDTTestType>;
    expect(got).toBeTruthy();
    expect(got.doc.hello).toBe("world");
  });
  it("should accept another put and return results", async function () {
    const didPut = await crdt.bulk([{ id: "nice", value: { nice: "data" } }]);
    const head = didPut.head;
    expect(head.length).toBe(1);
    const { doc } = (await crdt.get("nice")) as DocValue<CRDTTestType>;
    expect(doc.nice).toBe("data");
  });
  it("should allow for a delete", async function () {
    const didDel = await crdt.bulk([{ id: "hello", del: true }]);
    expect(didDel.head).toBeTruthy();
    const got = await crdt.get("hello");
    expect(got).toBeFalsy();
  });
  it("should offer changes", async function () {
    const { result } = await crdt.changes<Partial<CRDTTestType>>([]);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe("hello");
    expect(result[0].value?.hello).toBe("world");
  });
});

describe("CRDT with a multi-write", function () {
  interface CRDTTestType {
    readonly points: number;
  }
  let crdt: CRDT;
  let firstPut: CRDTMeta;
  const sthis = ensureSuperThis();

  afterEach(async function () {
    await crdt.close();
    await crdt.destroy();
  });
  beforeEach(async function () {
    await sthis.start();
    const dbOpts: LedgerOpts = {
      writeQueue: defaultWriteQueueOpts({}),
      keyBag: rt.defaultKeyBagOpts(sthis),
      storeUrls: toStoreURIRuntime(sthis, "test-crdt-cold"),
      storeEnDe: bs.ensureStoreEnDeFile({}),
    };
    crdt = new CRDTImpl(sthis, dbOpts);
    firstPut = await crdt.bulk([
      { id: "ace", value: { points: 11 } },
      { id: "king", value: { points: 10 } },
    ]);
  });
  it("should have a one-element head", async function () {
    const head = crdt.clock.head;
    expect(head.length).toBe(1);
    expect(firstPut.head.length).toBe(1);
  });
  it("return the records on get", async function () {
    const { doc } = (await crdt.get("ace")) as DocValue<CRDTTestType>;
    expect(doc.points).toBe(11);

    const got2 = (await crdt.get("king")) as DocValue<CRDTTestType>;
    expect(got2).toBeTruthy();
    expect(got2.doc.points).toBe(10);
  });
  it("should accept another put and return results", async function () {
    const didPut = await crdt.bulk([{ id: "queen", value: { points: 10 } }]);
    const head = didPut.head;
    expect(head.length).toBe(1);
    const got = (await crdt.get("queen")) as DocValue<CRDTTestType>;
    expect(got).toBeTruthy();
    expect(got.doc.points).toBe(10);
  });
  it("should offer changes", async function () {
    const { result } = await crdt.changes<CRDTTestType>([]);
    expect(result.length).toBe(2);
    expect(result[0].id).toBe("ace");
    expect(result[0].value?.points).toBe(11);
    expect(result[1].id).toBe("king");
  });
  it("should offer changes since", async function () {
    /** @type {CRDTMeta} */
    const secondPut = await crdt.bulk([
      { id: "queen", value: { points: 10 } },
      { id: "jack", value: { points: 10 } },
    ]);
    expect(secondPut.head).toBeTruthy();
    const { result: r2, head: h2 } = await crdt.changes<CRDTTestType>();
    expect(r2.length).toBe(4);
    const { result: r3 } = await crdt.changes(firstPut.head);
    expect(r3.length).toBe(2);
    const { result: r4 } = await crdt.changes(h2);
    expect(r4.length).toBe(0);
  });
});

interface CRDTTestType {
  readonly points: number;
}
describe("CRDT with two multi-writes", function () {
  let crdt: CRDT;
  let firstPut: CRDTMeta;
  let secondPut: CRDTMeta;
  const sthis = ensureSuperThis();
  afterEach(async function () {
    await crdt.close();
    await crdt.destroy();
  });
  beforeEach(async () => {
    await sthis.start();
    const dbOpts: LedgerOpts = {
      writeQueue: defaultWriteQueueOpts({}),
      keyBag: rt.defaultKeyBagOpts(sthis),
      storeUrls: toStoreURIRuntime(sthis, `test-multiple-writes@${sthis.nextId().str}`),
      storeEnDe: bs.ensureStoreEnDeFile({}),
    };
    crdt = new CRDTImpl(sthis, dbOpts);
    firstPut = await crdt.bulk([
      { id: "ace", value: { points: 11 } },
      { id: "king", value: { points: 10 } },
    ]);
    secondPut = await crdt.bulk([
      { id: "queen", value: { points: 10 } },
      { id: "jack", value: { points: 10 } },
    ]);
  });
  it("should have a one-element head", async function () {
    const head = crdt.clock.head;
    expect(head.length).toBe(1);
    expect(firstPut.head.length).toBe(1);
    expect(secondPut.head.length).toBe(1);
    expect(firstPut.head[0]).not.toBe(secondPut.head[0]);
  });
  it("return the records on get", async function () {
    const ret = await crdt.get("ace");
    expect(ret).not.toBeNull();
    const { doc } = ret as DocValue<CRDTTestType>;
    expect(doc.points).toBe(11);

    for (const key of ["king", "queen", "jack"]) {
      const { doc } = (await crdt.get(key)) as DocValue<CRDTTestType>;
      expect(doc.points).toBe(10);
    }
  });
  it("should offer changes", async function () {
    const { result } = await crdt.changes<CRDTTestType>();
    expect(result.length).toBe(4);
    expect(result[0].id).toBe("ace");
    expect(result[0].value?.points).toBe(11);
    expect(result[1].id).toBe("king");
    expect(result[2].id).toBe("queen");
    expect(result[3].id).toBe("jack");
  });
});

describe("Compact a named CRDT with writes", function () {
  let crdt: CRDT;
  const sthis = ensureSuperThis();
  afterEach(async function () {
    await crdt.close();
    await crdt.destroy();
  });
  beforeEach(async function () {
    await sthis.start();
    const dbOpts: LedgerOpts = {
      writeQueue: defaultWriteQueueOpts({}),
      keyBag: rt.defaultKeyBagOpts(sthis),
      storeUrls: toStoreURIRuntime(sthis, `named-crdt-compaction`),
      storeEnDe: bs.ensureStoreEnDeFile({}),
    };
    crdt = new CRDTImpl(sthis, dbOpts);
    for (let i = 0; i < 10; i++) {
      const bulk = [
        { id: "ace", value: { points: 11 } },
        { id: "king", value: { points: 10 } },
      ];
      await crdt.bulk(bulk);
    }
  });
  it("has data", async function () {
    const got = (await crdt.get("ace")) as DocValue<CRDTTestType>;
    expect(got.doc).toBeTruthy();
    expect(got.doc.points).toBe(11);
  });
  it("should start with blocks", async function () {
    const blz: bs.AnyBlock[] = [];
    for await (const blk of crdt.blockstore.entries()) {
      blz.push(blk);
    }
    expect(blz.length).toBe(13);
  });
  it("should start with changes", async function () {
    const { result } = await crdt.changes();
    expect(result.length).toBe(2);
    expect(result[0].id).toBe("ace");
  });
  it.skip("should have fewer blocks after compact", async function () {
    await crdt.compact();
    const blz: bs.AnyBlock[] = [];
    for await (const blk of crdt.blockstore.entries()) {
      blz.push(blk);
    }
    expect(blz.length).toBe(23);
  });
  it("should have data after compact", async function () {
    await crdt.compact();
    const got = (await crdt.get("ace")) as DocValue<CRDTTestType>;
    expect(got.doc).toBeTruthy();
    expect(got.doc.points).toBe(11);
  });
  it("should have changes after compact", async function () {
    const chs = await crdt.changes();
    expect(chs.result[0].id).toBe("ace");
  });
});

describe("CRDT with an index", function () {
  let crdt: CRDT;
  let idx: Index<number, CRDTTestType>;
  const sthis = ensureSuperThis();
  afterEach(async function () {
    await crdt.close();
    await crdt.destroy();
  });
  beforeEach(async function () {
    await sthis.start();
    const dbOpts: LedgerOpts = {
      writeQueue: defaultWriteQueueOpts({}),
      keyBag: rt.defaultKeyBagOpts(sthis),
      storeUrls: toStoreURIRuntime(sthis, "test-crdt-cold"),
      storeEnDe: bs.ensureStoreEnDeFile({}),
    };
    crdt = new CRDTImpl(sthis, dbOpts);
    await crdt.bulk([
      { id: "ace", value: { points: 11 } },
      { id: "king", value: { points: 10 } },
    ]);
    idx = await index<number, CRDTTestType>(crdt, "points");
  });
  it("should query the data", async function () {
    const got = await idx.query({ range: [9, 12] });
    expect(got.rows.length).toBe(2);
    expect(got.rows[0].id).toBe("king");
    expect(got.rows[0].key).toBe(10);
  });
  it("should register the index", async function () {
    const rIdx = await index<number, CRDTTestType>(crdt, "points");
    expect(rIdx).toBeTruthy();
    expect(rIdx.name).toBe("points");
    const got = await rIdx.query({ range: [9, 12] });
    expect(got.rows.length).toBe(2);
    expect(got.rows[0].id).toBe("king");
    expect(got.rows[0].key).toBe(10);
  });
  it("creating a different index with same name should not work", async function () {
    const e = await index(crdt, "points", (doc) => doc._id)
      .query()
      .catch((err) => err);
    expect(e.message).toMatch(/cannot apply/);
  });
});

describe("Loader with a committed transaction", function () {
  let loader: bs.Loader;
  let blockstore: bs.EncryptedBlockstore;
  let crdt: CRDT;
  let done: CRDTMeta;
  const dbname = "test-loader";
  const sthis = ensureSuperThis();
  afterEach(async function () {
    await crdt.close();
    await crdt.destroy();
  });
  beforeEach(async function () {
    await sthis.start();
    const dbOpts: LedgerOpts = {
      writeQueue: defaultWriteQueueOpts({}),
      keyBag: rt.defaultKeyBagOpts(sthis),
      storeUrls: toStoreURIRuntime(sthis, dbname),
      storeEnDe: bs.ensureStoreEnDeFile({}),
    };
    crdt = new CRDTImpl(sthis, dbOpts);
    blockstore = crdt.blockstore as bs.EncryptedBlockstore;
    expect(blockstore.loader).toBeTruthy();
    loader = blockstore.loader as bs.Loader;
    done = await crdt.bulk([{ id: "foo", value: { foo: "bar" } }]);
  });
  // it("should have a name", function () {
  //   expect(loader.ebOpts.storeUrls).toEqual({
  //     data: "file://./dist/fp-dir-file?name=test-loader&store=data&storekey=%40test-loader-data%40&suffix=.car&urlGen=fromEnv",
  //     file: "file://./dist/fp-dir-file?name=test-loader&store=data&storekey=%40test-loader-data%40&urlGen=fromEnv",
  //     meta: "file://./dist/fp-dir-file?name=test-loader&store=meta&storekey=%40test-loader-meta%40&urlGen=fromEnv",
  //     wal: "file://./dist/fp-dir-file?name=test-loader&store=wal&storekey=%40test-loader-wal%40&urlGen=fromEnv",
  //   });
  // });
  it("should commit a transaction", function () {
    expect(done.head).toBeTruthy();
    // expect(done.cars).toBeTruthy();
    expect(loader.carLog.length).toBe(1);
  });
  it("can load the car", async () => {
    const blk = loader.carLog[0][0];
    expect(blk).toBeTruthy();
    const reader = await loader.loadCar(blk);
    expect(reader).toBeTruthy();
    const parsed = await bs.parseCarFile<CRDTMeta>(reader, loader.logger);
    expect(parsed.cars).toBeTruthy();
    expect(parsed.cars.length).toBe(0);
    expect(parsed.meta).toBeTruthy();
    expect(parsed.meta.head).toBeTruthy();
  });
});

describe("Loader with two committed transactions", function () {
  let loader: bs.Loader;
  let crdt: CRDT;
  let blockstore: bs.EncryptedBlockstore;
  let done1: CRDTMeta;
  let done2: CRDTMeta;
  const sthis = ensureSuperThis();
  afterEach(async function () {
    await crdt.close();
    await crdt.destroy();
  });
  beforeEach(async function () {
    await sthis.start();
    const dbOpts: LedgerOpts = {
      writeQueue: defaultWriteQueueOpts({}),
      keyBag: rt.defaultKeyBagOpts(sthis),
      storeUrls: toStoreURIRuntime(sthis, "test-loader"),
      storeEnDe: bs.ensureStoreEnDeFile({}),
    };
    crdt = new CRDTImpl(sthis, dbOpts);
    blockstore = crdt.blockstore as bs.EncryptedBlockstore;
    expect(blockstore.loader).toBeTruthy();
    loader = blockstore.loader as bs.Loader;
    done1 = await crdt.bulk([{ id: "apple", value: { foo: "bar" } }]);
    done2 = await crdt.bulk([{ id: "orange", value: { foo: "bar" } }]);
  });
  it("should commit two transactions", function () {
    expect(done1.head).toBeTruthy();
    // expect(done1.cars).toBeTruthy();
    expect(done2.head).toBeTruthy();
    // expect(done2.cars).toBeTruthy();
    expect(done1.head).not.toBe(done2.head);
    // expect(done1.cars).not.toBe(done2.cars);
    // expect(blockstore.transactions.size).toBe(2);
    expect(loader.carLog.length).toBe(2);
    // expect(loader.carLog.indexOf(done1.cars)).toBe(1);
    // expect(loader.carLog.map((cs) => cs.toString()).indexOf(done1.cars.toString())).toBe(1);
    // expect(loader.carLog.indexOf(done2.cars)).toBe(0);
    // expect(loader.carLog.map((cs) => cs.toString()).indexOf(done2.cars.toString())).toBe(0);
  });
  it("can load the car", async function () {
    const blk = loader.carLog[0][0];
    expect(blk).toBeTruthy();
    const reader = await loader.loadCar(blk);
    expect(reader).toBeTruthy();
    const parsed = await bs.parseCarFile<CRDTMeta>(reader, loader.logger);
    expect(parsed.cars).toBeTruthy();
    expect(parsed.cars.length).toBe(1);
    expect(parsed.meta).toBeTruthy();
    expect(parsed.meta.head).toBeTruthy();
  });
});

describe("Loader with many committed transactions", function () {
  let loader: bs.Loader;
  let blockstore: bs.EncryptedBlockstore;
  let crdt: CRDT;
  let dones: CRDTMeta[];
  const count = 10;
  const sthis = ensureSuperThis();
  afterEach(async function () {
    await crdt.close();
    await crdt.destroy();
  });
  beforeEach(async function () {
    await sthis.start();
    const dbOpts: LedgerOpts = {
      writeQueue: defaultWriteQueueOpts({}),
      keyBag: rt.defaultKeyBagOpts(sthis),
      storeUrls: toStoreURIRuntime(sthis, "test-loader-many"),
      storeEnDe: bs.ensureStoreEnDeFile({}),
    };
    crdt = new CRDTImpl(sthis, dbOpts);
    blockstore = crdt.blockstore as bs.EncryptedBlockstore;
    expect(blockstore.loader).toBeTruthy();
    loader = blockstore.loader as bs.Loader;
    dones = [];
    for (let i = 0; i < count; i++) {
      const did = await crdt.bulk([{ id: `apple${i}`, value: { foo: "bar" } }]);
      dones.push(did);
    }
  });
  it("should commit many transactions", function () {
    for (const done of dones) {
      expect(done.head).toBeTruthy();
      // expect(done.cars).toBeTruthy();
    }
    expect(blockstore.transactions.size).toBe(0); // cleaned up on commit
    expect(loader.carLog.length).toBe(count);
  });
  it("can load the car", async function () {
    const blk = loader.carLog[2][0];
    // expect(dones[5].cars).toBeTruthy();
    const reader = await loader.loadCar(blk);
    expect(reader).toBeTruthy();
    const parsed = await bs.parseCarFile<CRDTMeta>(reader, loader.logger);
    expect(parsed.cars).toBeTruthy();
    expect(parsed.cars.length).toBe(7);
    expect(parsed.meta).toBeTruthy();
    expect(parsed.meta.head).toBeTruthy();
  });
});

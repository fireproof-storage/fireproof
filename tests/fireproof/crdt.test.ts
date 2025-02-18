import { CRDT, defaultWriteQueueOpts, ensureSuperThis, LedgerOpts, toStoreURIRuntime, rt, CRDTImpl, PARAM } from "@fireproof/core";
import { bs } from "@fireproof/core";
import { CRDTMeta, DocValue } from "@fireproof/core";
import { Index, index } from "@fireproof/core";
import { BuildURI } from "@adviser/cement";
import { decode } from 'cborg';

describe("Fresh crdt", function () {
  let crdt: CRDT;
  const sthis = ensureSuperThis();
  afterEach(async () => {
    await crdt.close();
    await crdt.destroy();
  });
  beforeEach(async () => {
    await sthis.start();
    const dbOpts: LedgerOpts = {
      name: "test-crdt",
      writeQueue: defaultWriteQueueOpts({}),
      keyBag: rt.defaultKeyBagOpts(sthis),
      storeUrls: toStoreURIRuntime(sthis, "test-crdt-cold"),
      storeEnDe: bs.ensureStoreEnDeFile({}),
    };
    crdt = new CRDTImpl(sthis, dbOpts);
    await crdt.ready();
  });
  it("should have an empty head", async () => {
    const head = crdt.clock.head;
    expect(head.length).toBe(0);
  });
  it("should accept put and return results", async () => {
    const didPut = await crdt.bulk([{ id: "hello", value: { hello: "world" } }]);
    const head = didPut.head;
    expect(head.length).toBe(1);
  });
  it("should accept multi-put and return results", async () => {
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

  afterEach(async () => {
    await crdt.close();
    await crdt.destroy();
  });

  beforeEach(async () => {
    await sthis.start();
    const dbOpts: LedgerOpts = {
      name: "test-crdt",
      writeQueue: defaultWriteQueueOpts({}),
      keyBag: rt.defaultKeyBagOpts(sthis),
      storeUrls: toStoreURIRuntime(sthis, `test@${sthis.nextId().str}`),
      storeEnDe: bs.ensureStoreEnDeFile({}),
    };
    crdt = new CRDTImpl(sthis, dbOpts);
    firstPut = await crdt.bulk([{ id: "hello", value: { hello: "world" } }]);
  });
  it("should have a one-element head", async () => {
    const head = crdt.clock.head;
    expect(head.length).toBe(1);
  });
  it("should return the head", async () => {
    expect(firstPut.head.length).toBe(1);
  });
  it("return the record on get", async () => {
    const got = (await crdt.get("hello")) as DocValue<CRDTTestType>;
    expect(got).toBeTruthy();
    expect(got.doc.hello).toBe("world");
  });
  it("should accept another put and return results", async () => {
    const didPut = await crdt.bulk([{ id: "nice", value: { nice: "data" } }]);
    const head = didPut.head;
    expect(head.length).toBe(1);
    const { doc } = (await crdt.get("nice")) as DocValue<CRDTTestType>;
    expect(doc.nice).toBe("data");
  });
  it("should allow for a delete", async () => {
    const didDel = await crdt.bulk([{ id: "hello", del: true }]);
    expect(didDel.head).toBeTruthy();
    const got = await crdt.get("hello");
    expect(got).toBeFalsy();
  });
  it("should offer changes", async () => {
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

  afterEach(async () => {
    await crdt.close();
    await crdt.destroy();
  });
  beforeEach(async () => {
    await sthis.start();
    const dbOpts: LedgerOpts = {
      name: "test-crdt",
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
  it("should have a one-element head", async () => {
    const head = crdt.clock.head;
    expect(head.length).toBe(1);
    expect(firstPut.head.length).toBe(1);
  });
  it("return the records on get", async () => {
    const { doc } = (await crdt.get("ace")) as DocValue<CRDTTestType>;
    expect(doc.points).toBe(11);

    const got2 = (await crdt.get("king")) as DocValue<CRDTTestType>;
    expect(got2).toBeTruthy();
    expect(got2.doc.points).toBe(10);
  });
  it("should accept another put and return results", async () => {
    const didPut = await crdt.bulk([{ id: "queen", value: { points: 10 } }]);
    const head = didPut.head;
    expect(head.length).toBe(1);
    const got = (await crdt.get("queen")) as DocValue<CRDTTestType>;
    expect(got).toBeTruthy();
    expect(got.doc.points).toBe(10);
  });
  it("should offer changes", async () => {
    const { result } = await crdt.changes<CRDTTestType>([]);
    expect(result.length).toBe(2);
    expect(result[0].id).toBe("ace");
    expect(result[0].value?.points).toBe(11);
    expect(result[1].id).toBe("king");
  });
  it("should offer changes since", async () => {
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
  afterEach(async () => {
    await crdt.close();
    await crdt.destroy();
  });
  beforeEach(async () => {
    await sthis.start();
    const dbOpts: LedgerOpts = {
      name: "test-crdt",
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
  it("should have a one-element head", async () => {
    const head = crdt.clock.head;
    expect(head.length).toBe(1);
    expect(firstPut.head.length).toBe(1);
    expect(secondPut.head.length).toBe(1);
    expect(firstPut.head[0]).not.toBe(secondPut.head[0]);
  });
  it("return the records on get", async () => {
    const ret = await crdt.get("ace");
    expect(ret).not.toBeNull();
    const { doc } = ret as DocValue<CRDTTestType>;
    expect(doc.points).toBe(11);

    for (const key of ["king", "queen", "jack"]) {
      const { doc } = (await crdt.get(key)) as DocValue<CRDTTestType>;
      expect(doc.points).toBe(10);
    }
  });
  it("should offer changes", async () => {
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
  afterEach(async () => {
    await crdt.close();
    await crdt.destroy();
  });
  beforeEach(async () => {
    await sthis.start();
    sthis.env.set("FP_STORAGE_URL", BuildURI.from(sthis.env.get("FP_STORAGE_URL")).setParam(PARAM.STORE_KEY, "insecure").toString());
    console.log("FP_STORAGE_URL", sthis.env.get("FP_STORAGE_URL"));
    const dbOpts: LedgerOpts = {
      name: "test-crdt",
      writeQueue: defaultWriteQueueOpts({}),
      keyBag: rt.defaultKeyBagOpts(sthis),
      storeUrls: toStoreURIRuntime(sthis, `named-crdt-compaction-${sthis.nextId().str}`),
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
    // await sleep(1000);
  });
  it("has data", async () => {
    const got = (await crdt.get("ace")) as DocValue<CRDTTestType>;
    expect(got.doc).toBeTruthy();
    expect(got.doc.points).toBe(11);
  });
  it("should start with blocks", async () => {
    const blz: bs.AnyBlock[] = [];
    for await (const blk of crdt.blockstore.entries()) {
      blz.push(blk);
    }
    expect(blz.map((i) => sthis.txt.decode(i.bytes) + "\n=================\n")).toEqual([

    ])
    expect(blz.map((i) => i.cid.toString())).toEqual([
         "bafyreiebpjwz24gowtbv3mr3wcqt6ypcjm6ondqclhru53dkby4npnqdeq",
   "bafyreig5jhovaiocwk3vfafzdspgtwinftjygyghjzigkc554muhdmp5ba",
   "bafyreiegj7yumreue7llzqroebigscedyzrkeir3zneg5q7zia77itowy4",
   "bafyreibslqo6sjj77fy45xhvphxt45xd7dhlzglb37sexviegi66m2zqia",
   "bafyreiaqsmgdqzr2vsgcp6sx2tadvdmvnnjnnzdvyxbuov7ldhm6k5knfq",
   "bafyreiff76gzgricfm73nyxm5ypbg7fy3cb6w65ltvo5oduqjq566zcoda",
   "bafyreiezej4gdjgzw3k5z45zpsj2iy42cs6humxr7e3v6mob6qh45s6fx4",
   "bafyreicyynhujiwq54xlkldavqtindhgjvdlaxxqjn4gqfvgb4pytfs7ka",
   "bafyreib4bllkgytzo4pgukinbo7agqkvd32a6pcgvbdqvzowfjzuzbfswe",
   "bafyreidnclmuatqf6yelrlp3pfsmwzkkofdbbkdedthfxh7nreoyacmwva",
   "bafyreibuugw3gfta5bibhi77ali7dhk74hw6n2ojskpwaznmo2mavprjrm",
   "bafyreifupkgympx4lmr7pd5oloti3zzfijvvnuqbgkbpn6uxxkom3kvb2m",
   "bafyreiaeoyem6uqqz6ddixv2ambiscxialuqgi5mvt7mwhfrzdviyh53z4",
   "bafyreihuykwc3irfwvmfdz3amh3hvamablrvqb6kpo7xdcroraktbosbly",
   "bafyreif6nsskhs5t6mwlzh4fi7hglrhqikk4pgituv6eymivujcebafyn4",
   "bafyreig72tfvtd7zm4twin4bgx733imlkvqonstxkg7f27qdmdg3ehrzx4",
   "bafyreia3eapldkpycceygv5lz2mlbbozyvno5ba7ou3ps2liytj2hh3wru",
   "bafyreidwknp7fo6yqxuta3nr2zpbpjadsvtqg3gr74vhhm6q7qrvqfcoxe",
   "bafyreiepqkkf6jm63d2hjjdsp4u3gge74c3cx6gzwfb4x6m2bbkcbwko3y",
   "bafyreigq42dy5zv744smplrz6ljhmuo2e5j4gxrk7eo3h7ei3chn2r4yai",
   "bafyreih2mmym2gzq3qljazv3rqlfjx452lv2pqlcpwkdv5o7skmxlzeqru",
   "bafyreidjjtz3ixbxfgmpspans22uyxi22fvitbquugmjqv76uot7go37wq",
   "bafyreibrbrcjfuwdnpk4agshincgdtb3atjnvzzjl2gcodb5dpru46osya",

    ]);
    // expect(blz.length).toBe(13);
  });
  it("should start with changes", async () => {
    const { result } = await crdt.changes();
    expect(result.length).toBe(2);
    expect(result[0].id).toBe("ace");
  });
  it.skip("should have fewer blocks after compact", async () => {
    await crdt.compact();
    const blz: bs.AnyBlock[] = [];
    for await (const blk of crdt.blockstore.entries()) {
      blz.push(blk);
    }
    expect(blz.length).toBe(23);
  });
  it("should have data after compact", async () => {
    await crdt.compact();
    const got = (await crdt.get("ace")) as DocValue<CRDTTestType>;
    expect(got.doc).toBeTruthy();
    expect(got.doc.points).toBe(11);
  });
  it("should have changes after compact", async () => {
    const chs = await crdt.changes();
    expect(chs.result[0].id).toBe("ace");
  });
});

describe("CRDT with an index", function () {
  let crdt: CRDT;
  let idx: Index<number, CRDTTestType>;
  const sthis = ensureSuperThis();
  afterEach(async () => {
    await crdt.close();
    await crdt.destroy();
  });
  beforeEach(async () => {
    await sthis.start();
    const dbOpts: LedgerOpts = {
      name: "test-crdt",
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
  it("should query the data", async () => {
    const got = await idx.query({ range: [9, 12] });
    expect(got.rows.length).toBe(2);
    expect(got.rows[0].id).toBe("king");
    expect(got.rows[0].key).toBe(10);
  });
  it("should register the index", async () => {
    const rIdx = await index<number, CRDTTestType>(crdt, "points");
    expect(rIdx).toBeTruthy();
    expect(rIdx.name).toBe("points");
    const got = await rIdx.query({ range: [9, 12] });
    expect(got.rows.length).toBe(2);
    expect(got.rows[0].id).toBe("king");
    expect(got.rows[0].key).toBe(10);
  });
  it("creating a different index with same name should not work", async () => {
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
  afterEach(async () => {
    await crdt.close();
    await crdt.destroy();
  });
  beforeEach(async () => {
    await sthis.start();
    const dbOpts: LedgerOpts = {
      name: "test-crdt",
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
    const reader = await loader.loadCar(blk, loader.attachedStores.local());
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
  afterEach(async () => {
    await crdt.close();
    await crdt.destroy();
  });
  beforeEach(async () => {
    await sthis.start();
    const dbOpts: LedgerOpts = {
      name: "test-crdt",
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
  it("can load the car", async () => {
    const blk = loader.carLog[0][0];
    expect(blk).toBeTruthy();
    const reader = await loader.loadCar(blk, loader.attachedStores.local());
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
  afterEach(async () => {
    await crdt.close();
    await crdt.destroy();
  });
  beforeEach(async () => {
    await sthis.start();
    const dbOpts: LedgerOpts = {
      name: "test-crdt",
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
  it("can load the car", async () => {
    const blk = loader.carLog[2][0];
    // expect(dones[5].cars).toBeTruthy();
    const reader = await loader.loadCar(blk, loader.attachedStores.local());
    expect(reader).toBeTruthy();
    const parsed = await bs.parseCarFile<CRDTMeta>(reader, loader.logger);
    expect(parsed.cars).toBeTruthy();
    expect(parsed.cars.length).toBe(7);
    expect(parsed.meta).toBeTruthy();
    expect(parsed.meta.head).toBeTruthy();
  });
});

import { CID } from "multiformats";
import { bs, ensureSuperThis, NotFoundError, SuperThis } from "@fireproof/core";

function runtime(sthis: SuperThis) {
  return bs.toStoreRuntime({}, sthis);
}

function mockLoader(sthis: SuperThis, name: string): bs.Loadable {
  return {
    sthis,
    name,
    ebOpts: {
      store: {},
    },
  } as bs.Loadable;
}

describe("DataStore", function () {
  let store: bs.DataStore;
  let raw: bs.TestGateway;

  const sthis = ensureSuperThis();
  afterEach(async () => {
    await store.close();
    await store.destroy();
  });

  beforeEach(async () => {
    await sthis.start();
    store = await runtime(sthis).makeDataStore(mockLoader(sthis, "test"));
    await store.start();
    raw = await bs.testStoreFactory(store.url(), sthis);
  });

  it("should have a name", function () {
    expect(store.name).toEqual("test");
  });

  it("should save a car", async function () {
    const car: bs.AnyBlock = {
      cid: "cidKey" as unknown as CID,
      bytes: new Uint8Array([55, 56, 57]),
    };
    await store.save(car);
    const data = await raw.get(store.url(), car.cid.toString());
    expect(sthis.txt.decode(data)).toEqual(sthis.txt.decode(car.bytes));
  });
});

describe("DataStore with a saved car", function () {
  let store: bs.DataStore;
  let raw: bs.TestGateway;
  let car: bs.AnyBlock;

  const sthis = ensureSuperThis();

  afterEach(async () => {
    await store.close();
    await store.destroy();
  });

  beforeEach(async function () {
    await sthis.start();
    store = await runtime(sthis).makeDataStore(mockLoader(sthis, "test2"));
    await store.start();
    raw = await bs.testStoreFactory(store.url(), sthis);
    car = {
      cid: "cid" as unknown as CID,
      bytes: new Uint8Array([55, 56, 57, 80]),
    };
    await store.save(car);
  });

  it("should have a car", async function () {
    const data = await raw.get(store.url(), car.cid.toString());
    expect(sthis.txt.decode(data)).toEqual(sthis.txt.decode(car.bytes));
  });

  it("should load a car", async function () {
    const loaded = await store.load(car.cid);
    expect(loaded.cid).toEqual(car.cid);
    expect(loaded.bytes.constructor.name).toEqual("Uint8Array");
    expect(loaded.bytes.toString()).toEqual(car.bytes.toString());
  });

  it("should remove a car", async function () {
    await store.remove(car.cid);
    const { e: error } = (await store.load(car.cid).catch((e: Error) => ({ e }))) as { e: NotFoundError };
    expect(error).toBeTruthy();
  });
});

describe("MetaStore", function () {
  let store: bs.MetaStore;
  let raw: bs.TestGateway;

  const sthis = ensureSuperThis();

  afterEach(async () => {
    await store.close();
    await store.destroy();
  });

  beforeEach(async function () {
    await sthis.start();
    store = await runtime(sthis).makeMetaStore(mockLoader(sthis, "test"));
    await store.start();
    raw = await bs.testStoreFactory(store.url(), sthis);
  });

  it("should have a name", function () {
    expect(store.name).toEqual("test");
  });

  it("should save a header", async function () {
    const cid = CID.parse("bafybeia4luuns6dgymy5kau5rm7r4qzrrzg6cglpzpogussprpy42cmcn4");
    const h: bs.DbMeta = {
      cars: [cid],
      // key: undefined,
    };
    await store.save(h);
    const file = await raw.get(store.url(), "main");
    const [blockMeta] = await store.handleByteHeads(file);
    const decodedHeader = blockMeta.dbMeta;
    expect(decodedHeader).toBeTruthy();
    expect(decodedHeader.cars).toBeTruthy();
    expect(decodedHeader.cars[0].toString()).toEqual(cid.toString());
  });
});

describe("MetaStore with a saved header", function () {
  let store: bs.MetaStore;
  let raw: bs.TestGateway;
  let cid: CID;
  const sthis = ensureSuperThis();

  afterEach(async () => {
    await store.close();
    await store.destroy();
  });

  beforeEach(async function () {
    await sthis.start();
    store = await runtime(sthis).makeMetaStore(mockLoader(sthis, "test-saved-header"));
    await store.start();
    raw = await bs.testStoreFactory(store.url(), sthis);
    cid = CID.parse("bafybeia4luuns6dgymy5kau5rm7r4qzrrzg6cglpzpogussprpy42cmcn4");
    await store.save({ cars: [cid] /*, key: undefined */ });
  });

  it("should have a header", async function () {
    const bytes = await raw.get(store.url(), "main");
    const data = sthis.txt.decode(bytes);
    expect(data).toMatch(/parents/);
    const header = JSON.parse(data)[0];
    expect(header).toBeDefined();
    expect(header.parents).toBeDefined();
    const [blockMeta] = await store.handleByteHeads(bytes);
    const decodedHeader = blockMeta.dbMeta;
    expect(decodedHeader).toBeDefined();
    expect(decodedHeader.cars).toBeDefined();
    expect(decodedHeader.cars[0].toString()).toEqual(cid.toString());
  });

  it("should load a header", async function () {
    const loadeds = (await store.load()) as bs.DbMeta[];
    const loaded = loadeds[0];
    expect(loaded).toBeTruthy();
    expect(loaded.cars).toBeTruthy();
    expect(loaded.cars.toString()).toEqual(cid.toString());
  });
});

import { CID } from "multiformats";
import { bs, NotFoundError, SuperThis } from "@fireproof/core";
import { mockSuperThis } from "../helpers";

const decoder = new TextDecoder("utf-8");

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

  const sthis = mockSuperThis();
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
    expect(decoder.decode(data)).toEqual(decoder.decode(car.bytes));
  });
});

describe("DataStore with a saved car", function () {
  let store: bs.DataStore;
  let raw: bs.TestGateway;
  let car: bs.AnyBlock;

  const sthis = mockSuperThis();

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
    expect(decoder.decode(data)).toEqual(decoder.decode(car.bytes));
  });

  it("should load a car", async function () {
    const loaded = await store.load(car.cid);
    expect(loaded.cid).toEqual(car.cid);
    expect(loaded.bytes.constructor.name).toEqual("Uint8Array");
    expect(loaded.bytes.toString()).toEqual(car.bytes.toString());
  });

  it("should remove a car", async function () {
    await store.remove(car.cid);
    const error = (await store.load(car.cid).catch((e: Error) => e)) as NotFoundError;
    expect(error.code).toMatch("ENOENT");
    // matches(error.message, "ENOENT");
  });
});

describe("MetaStore", function () {
  let store: bs.MetaStore;
  let raw: bs.TestGateway;

  const sthis = mockSuperThis();

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
    const header = JSON.parse(decoder.decode(file));
    expect(header).toBeTruthy();
    expect(header.cars).toBeTruthy();
    expect(header.cars[0]["/"]).toEqual(cid.toString());
  });
});

describe("MetaStore with a saved header", function () {
  let store: bs.MetaStore;
  let raw: bs.TestGateway;
  let cid: CID;
  const sthis = mockSuperThis();
  let onload = false;

  afterEach(async () => {
    await store.close();
    await store.destroy();
  });

  beforeEach(async function () {
    await sthis.start();
    store = await runtime(sthis).makeMetaStore(mockLoader(sthis, "test-saved-header"));
    store.onLoad("main", async () => {
      onload = true;
    });
    await store.start();
    raw = await bs.testStoreFactory(store.url(), sthis);
    cid = CID.parse("bafybeia4luuns6dgymy5kau5rm7r4qzrrzg6cglpzpogussprpy42cmcn4");
    await store.save({ cars: [cid] /*, key: undefined */ });
  });

  it("should load", async function () {
    expect(onload).toBeTruthy();
  });

  it("should have a header", async function () {
    const data = decoder.decode(await raw.get(store.url(), "main"));
    expect(data).toMatch(/car/);
    const header = JSON.parse(data);
    expect(header).toBeTruthy();
    expect(header.cars).toBeTruthy();
    expect(header.cars[0]["/"]).toEqual(cid.toString());
  });

  it("should load a header", async function () {
    const loadeds = (await store.load()) as bs.DbMeta[];
    const loaded = loadeds[0];
    expect(loaded).toBeTruthy();
    expect(loaded.cars).toBeTruthy();
    expect(loaded.cars.toString()).toEqual(cid.toString());
  });
});

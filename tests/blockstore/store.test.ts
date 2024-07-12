import { CID } from "multiformats";
import { rt, bs } from "@fireproof/core";
import { MockLogger } from "@adviser/cement";
import { NotFoundError } from "../../src/blockstore/gateway";

const decoder = new TextDecoder("utf-8");

function runtime() {
  return bs.toStoreRuntime({}, MockLogger().logger);
}

function mockLoader(name: string): bs.Loadable {
  return {
    name,
    ebOpts: {
      store: {},
    },
  } as bs.Loadable;
}

describe("DataStore", function () {
  let store: bs.DataStore;
  let raw: bs.TestStore;

  afterEach(async () => {
    await store.close();
    await store.destroy();
  });

  beforeEach(async () => {
    await rt.SysContainer.start();
    store = await runtime().makeDataStore(mockLoader("test"));
    await store.start();
    raw = await bs.testStoreFactory(store.url);
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
    const data = await raw.get(store.url, car.cid.toString());
    expect(decoder.decode(data)).toEqual(decoder.decode(car.bytes));
  });
});

describe("DataStore with a saved car", function () {
  let store: bs.DataStore;
  let raw: bs.TestStore;
  let car: bs.AnyBlock;

  afterEach(async () => {
    await store.close();
    await store.destroy();
  });

  beforeEach(async function () {
    await rt.SysContainer.start();
    store = await runtime().makeDataStore(mockLoader("test2"));
    await store.start();
    raw = await bs.testStoreFactory(store.url);
    car = {
      cid: "cid" as unknown as CID,
      bytes: new Uint8Array([55, 56, 57, 80]),
    };
    await store.save(car);
  });

  it("should have a car", async function () {
    const data = await raw.get(store.url, car.cid.toString());
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
  let raw: bs.TestStore;

  afterEach(async () => {
    await store.close();
    await store.destroy();
  });

  beforeEach(async function () {
    await rt.SysContainer.start();
    store = await runtime().makeMetaStore(mockLoader("test"));
    await store.start();
    raw = await bs.testStoreFactory(store.url);
  });

  it("should have a name", function () {
    expect(store.name).toEqual("test");
  });

  it("should save a header", async function () {
    const cid = CID.parse("bafybeia4luuns6dgymy5kau5rm7r4qzrrzg6cglpzpogussprpy42cmcn4");
    const h: bs.DbMeta = {
      cars: [cid],
      key: undefined,
    };
    await store.save(h);
    const file = await raw.get(store.url, "main");
    const header = JSON.parse(decoder.decode(file));
    expect(header).toBeTruthy();
    expect(header.cars).toBeTruthy();
    expect(header.cars[0]["/"]).toEqual(cid.toString());
  });
});

describe("MetaStore with a saved header", function () {
  let store: bs.MetaStore;
  let raw: bs.TestStore;
  let cid: CID;

  afterEach(async () => {
    await store.close();
    await store.destroy();
  });

  beforeEach(async function () {
    await rt.SysContainer.start();
    store = await runtime().makeMetaStore(mockLoader("test-saved-header"));
    await store.start();
    raw = await bs.testStoreFactory(store.url);
    cid = CID.parse("bafybeia4luuns6dgymy5kau5rm7r4qzrrzg6cglpzpogussprpy42cmcn4");
    await store.save({ cars: [cid], key: undefined });
  });

  it("should have a header", async function () {
    const data = decoder.decode(await raw.get(store.url, "main"));
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

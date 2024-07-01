import { CID } from "multiformats";

import { matches, equals } from "../helpers.js";

import { MetaStore, DataStore, Loader, Loadable, testStoreFactory } from "@fireproof/core/storage-engine";

import { toStoreRuntime } from "@fireproof/core/storage-engine"
import { AnyBlock, DbMeta } from "@fireproof/core/storage-engine";
import { SysContainer, assert } from "@fireproof/core/runtime";
import { TestStore } from "../../src/storage-engine/types.js";

const decoder = new TextDecoder("utf-8");

describe("DataStore", function () {
  let store: DataStore;
  let raw: TestStore;

  beforeEach(async () => {
    await SysContainer.start();
    store = await toStoreRuntime().makeDataStore({ name: "test" } as Loadable);
    raw = await testStoreFactory(store.url);
  });

  it("should have a name", function () {
    equals(store.name, "test");
  });

  it("should save a car", async function () {
    const car: AnyBlock = {
      cid: "cid" as unknown as CID,
      bytes: new Uint8Array([55, 56, 57]),
    };
    await store.save(car);
    // const path = SysContainer.join(store.url.pathname, store.name, "data", car.cid + ".car");
    // const data = await SysContainer.readfile(path);
    const data = await raw.get(car.cid.toString());
    equals(decoder.decode(data), decoder.decode(car.bytes));
  });
});

describe("DataStore with a saved car", function () {
  let store: DataStore
  let raw: TestStore;
  let car: AnyBlock;

  beforeEach(async function () {
    await SysContainer.start();
    store = await toStoreRuntime().makeDataStore({ name: "test2" } as Loadable);
    raw = await testStoreFactory(store.url);
    car = {
      cid: "cid" as unknown as CID,
      bytes: new Uint8Array([55, 56, 57, 80]),
    };
    await store.save(car);
  });

  it("should have a car", async function () {
    // const path = SysContainer.join(store.url.pathname, store.name, "data", car.cid + ".car");
    // const data = await SysContainer.readfile(path);
    const data = await raw.get(car.cid.toString());
    equals(decoder.decode(data), decoder.decode(car.bytes));
  });

  it("should load a car", async function () {
    const loaded = await store.load(car.cid);
    equals(loaded.cid, car.cid);
    equals(loaded.bytes.constructor.name, "Uint8Array");
    equals(loaded.bytes.toString(), car.bytes.toString());
  });

  it("should remove a car", async function () {
    await store.remove(car.cid);
    const error = await store.load(car.cid).catch((e: Error) => e) as Error;
    matches(error.message, "ENOENT");
  });
});

describe("MetaStore", function () {
  let store: MetaStore
  let raw: TestStore;

  beforeEach(async function () {
    await SysContainer.start();
    store = await toStoreRuntime().makeMetaStore({ name: "test" } as unknown as Loader);
    raw = await testStoreFactory(store.url);
  });

  it("should have a name", function () {
    equals(store.name, "test");
  });

  it("should save a header", async function () {
    const cid = CID.parse("bafybeia4luuns6dgymy5kau5rm7r4qzrrzg6cglpzpogussprpy42cmcn4");
    const h: DbMeta = {
      cars: [cid],
      key: undefined,
    };
    await store.save(h);
    const file = await raw.get("main")
    // SysContainer.rawDB.get(store.url, "meta", "main", 'json');
    const header = JSON.parse(decoder.decode(file));
    assert(header);
    assert(header.cars)
    equals(header.cars[0]["/"], cid.toString());
  });
});

describe("MetaStore with a saved header", function () {
  let store: MetaStore
  let raw: TestStore;
  let cid: CID;

  beforeEach(async function () {
    await SysContainer.start();
    store = await toStoreRuntime().makeMetaStore({ name: "test-saved-header" } as unknown as Loader);
    raw = await testStoreFactory(store.url);
    cid = CID.parse("bafybeia4luuns6dgymy5kau5rm7r4qzrrzg6cglpzpogussprpy42cmcn4");
    await store.save({ cars: [cid], key: undefined });
  });

  it("should have a header", async function () {
    // const path = SysContainer.join(dataDir(), store.name, "meta", "main.json");
    // const data = await SysContainer.readfile(path);
    const data = decoder.decode(await raw.get("main"));
    matches(data, /car/);
    const header = JSON.parse(data);
    assert(header);
    assert(header.cars);
    equals(header.cars[0]["/"], cid.toString());
  });

  it("should load a header", async function () {
    const loadeds = await store.load() as DbMeta[];
    const loaded = loadeds[0];
    assert(loaded);
    assert(loaded.cars);
    equals(loaded.cars.toString(), cid.toString());
  });
});

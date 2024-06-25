import { CID } from "multiformats";

import { matches, equals, dataDir } from "../helpers.js";

import { MetaStore, DataStore, Loader, Loadable } from "@fireproof/core/storage-engine";

import { toStoreRuntime } from "@fireproof/core/storage-engine"
import { AnyBlock, DbMeta, StoreRuntime } from "@fireproof/core/storage-engine";
import { SysContainer, assert } from "@fireproof/core/runtime";

const decoder = new TextDecoder("utf-8");

describe("DataStore", function () {
  let store: DataStore;
  let runtime: StoreRuntime;

  beforeEach(async () => {
    await SysContainer.start();
    runtime = toStoreRuntime({})
    store = await runtime.makeDataStore({ name: "test" } as Loadable);
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
    const path = SysContainer.join(store.url.pathname, store.name, "data", car.cid + ".car");
    const data = await SysContainer.readfile(path);
    equals(data.toString(), decoder.decode(car.bytes));
  });
});

describe("DataStore with a saved car", function () {
  let store: DataStore
  let runtime: StoreRuntime;
  let car: AnyBlock;

  beforeEach(async function () {
    await SysContainer.start();
    runtime = toStoreRuntime({})
    store = await runtime.makeDataStore({ name: "test2" } as Loadable);
    car = {
      cid: "cid" as unknown as CID,
      bytes: new Uint8Array([55, 56, 57, 80]),
    };
    await store.save(car);
  });

  it("should have a car", async function () {
    const path = SysContainer.join(store.url.pathname, store.name, "data", car.cid + ".car");
    const data = await SysContainer.readfile(path);
    equals(data.toString(), decoder.decode(car.bytes));
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
  let runtime: StoreRuntime;

  beforeEach(async function () {
    await SysContainer.start();
    runtime = toStoreRuntime()
    store = await runtime.makeMetaStore({ name: "test" } as unknown as Loader);
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
    const path = SysContainer.join(dataDir(), store.name, "meta", "main.json");
    const file = await SysContainer.readfile(path);
    const header = JSON.parse(file.toString());
    assert(header);
    assert(header.cars)
    equals(header.cars[0]["/"], cid.toString());
  });
});

describe("MetaStore with a saved header", function () {
  let store: MetaStore
  let cid: CID;
  let runtime: StoreRuntime;

  beforeEach(async function () {
    await SysContainer.start();
    runtime = toStoreRuntime()
    store = await runtime.makeMetaStore({ name: "test-saved-header" } as unknown as Loader);
    cid = CID.parse("bafybeia4luuns6dgymy5kau5rm7r4qzrrzg6cglpzpogussprpy42cmcn4");
    await store.save({ cars: [cid], key: undefined });
  });

  it("should have a header", async function () {
    const path = SysContainer.join(dataDir(), store.name, "meta", "main.json");
    const data = await SysContainer.readfile(path);
    matches(data, /car/);
    const header = JSON.parse(data.toString());
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

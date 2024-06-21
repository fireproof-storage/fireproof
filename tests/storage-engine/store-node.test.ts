import { join } from "node:path";
import { promises } from "node:fs";
import { CID } from "multiformats";

import { assert, matches, equals, dataDir } from "../fireproof/helpers";

import { MetaStore, DataStore, Loader } from "../../src/storage-engine";

import { toStoreRuntime } from "../../src/storage-engine/index";
import { AnyBlock, DbMeta, StoreRuntime } from "../../src/storage-engine/types";

const { readFile } = promises;

const decoder = new TextDecoder("utf-8");

describe("DataStore", function () {
  let store: DataStore;
  let runtime: StoreRuntime;

  beforeEach(async () => {
    runtime = toStoreRuntime({})
    store = await runtime.makeDataStore("test");
  });

  it("should have a name", function () {
    equals(store.name, "test");
  });

  it("should save a car", async function () {
    const car: AnyBlock = {
      cid: CID.parse("cid"),
      bytes: new Uint8Array([55, 56, 57]),
    };
    await store.save(car);
    const path = join(runtime.stores.data.pathname, store.name, "data", car.cid + ".car");
    const data = await readFile(path);
    equals(data.toString(), decoder.decode(car.bytes));
  });
});

describe("DataStore with a saved car", function () {
  let store: DataStore
  let runtime: StoreRuntime;
  let car: AnyBlock;

  beforeEach(async function () {
    runtime = toStoreRuntime({})
    store = await runtime.makeDataStore("test2");
    car = {
      cid: CID.parse("cid"),
      bytes: new Uint8Array([55, 56, 57, 80]),
    };
    await store.save(car);
  });

  it("should have a car", async function () {
    const path = join(runtime.stores.data.pathname, store.name, "data", car.cid + ".car");
    const data = await readFile(path);
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
    const error = await store.load(car.cid).catch((e) => e);
    matches(error.message, "ENOENT");
  });
});

describe("MetaStore", function () {
  let store: MetaStore
  let runtime: StoreRuntime;

  beforeEach(async function () {
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
    const path = join(dataDir, store.name, "meta", "main.json");
    const file = await readFile(path);
    const header = JSON.parse(file.toString());
    assert(header);
    assert(header.cars);
    equals(header.cars[0]["/"], cid.toString());
  });
});

describe("MetaStore with a saved header", function () {
  let store: MetaStore
  let cid: CID;
  let runtime: StoreRuntime;

  beforeEach(async function () {
    runtime = toStoreRuntime()
    store = await runtime.makeMetaStore({ name: "test-saved-header" } as unknown as Loader);
    cid = CID.parse("bafybeia4luuns6dgymy5kau5rm7r4qzrrzg6cglpzpogussprpy42cmcn4");
    await store.save({ cars: [cid], key: undefined });
  });

  it("should have a header", async function () {
    const path = join(dataDir, store.name, "meta", "main.json");
    const data = await readFile(path);
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

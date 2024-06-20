



/* eslint-disable mocha/max-top-level-suites */

import { join } from "path";
import { promises } from "fs";

import { CID } from "multiformats";


import { assert, matches, equals, dataDir } from "../fireproof/helpers.js";

import { DataStore, MetaStore } from "../../src/node/store-node.js";
import { AnyBlock, AnyLink } from "../../src/types.js";
import { DbMeta } from "../../src/storage-engine/types.js";

const { readFile } = promises;

const decoder = new TextDecoder("utf-8");

describe("DataStore", function () {
  let store: DataStore;

  beforeEach(function () {
    store = new DataStore("test");
  });

  it("should have a name", function () {
    equals(store.name, "test");
  });

  it("should save a car", async function () {
    const car: AnyBlock = {
      cid: "cid" as unknown as AnyLink,
      bytes: new Uint8Array([55, 56, 57]),
    };
    await store.save(car);
    const path = join(DataStore.dataDir, store.name, "data", car.cid + ".car");
    const data = await readFile(path);
    equals(data.toString(), decoder.decode(car.bytes));
  });
});

describe("DataStore with a saved car", function () {
  let store: DataStore
  let car: AnyBlock;

  beforeEach(async function () {
    store = new DataStore("test2");
    car = {
      cid: "cid" as unknown as AnyLink,
      bytes: new Uint8Array([55, 56, 57, 80]),
    };
    await store.save(car);
  });

  it("should have a car", async function () {
    const path = join(DataStore.dataDir, store.name, "data", car.cid + ".car");
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

  beforeEach(function () {
    store = new MetaStore("test");
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

  beforeEach(async function () {
    store = new MetaStore("test-saved-header");
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

import { CID } from "multiformats";
import { rt, bs, NotFoundError, PARAM, ensureSuperThis } from "@fireproof/core";
import { Result } from "@adviser/cement";
import { createAttachedStores } from "../../src/blockstore/attachable-store.js";
import { mockLoader, noopUrl } from "../helpers.js";

// function runtime(sthis: SuperThis) {
//   return bs.toStoreRuntime(sthis);
// }

// async function mockLoader(sthis: SuperThis, name?: string): Promise<bs.StoreFactoryItem> {
//   const url = noopUrl(name);
//   return {
//     // sthis,
//     url: url,
//     loader:
//   };
// }

describe("CarStore", function () {
  let store: bs.CarStore;
  const sthis = ensureSuperThis();
  const loader = mockLoader(sthis);

  afterEach(async () => {
    await store.close();
    await store.destroy();
  });

  beforeEach(async () => {
    await sthis.start();
    const at = await createAttachedStores(noopUrl("test"), loader);
    store = at.stores.car;
    await store.start(at.stores);
  });

  it("should have a name", function () {
    expect(store.url().getParam(PARAM.NAME)).toEqual("test");
  });

  it("should save a car", async () => {
    const car: bs.AnyBlock = {
      cid: "cidKey" as unknown as CID,
      bytes: new Uint8Array([55, 56, 57]),
    };
    await store.save(car);
    const data = (await store.realGateway.getPlain({ loader }, store.url(), car.cid.toString())).Ok();
    expect(sthis.txt.decode(data)).toEqual(sthis.txt.decode(car.bytes));
  });
});

describe("CarStore with a saved car", function () {
  let store: bs.CarStore;
  let car: bs.AnyBlock;

  const sthis = ensureSuperThis();
  const loader = mockLoader(sthis);

  afterEach(async () => {
    await store.close();
    await store.destroy();
  });

  beforeEach(async () => {
    await sthis.start();

    const at = await createAttachedStores(noopUrl("test2"), loader);
    store = at.stores.car;
    await store.start(at.stores);
    car = {
      cid: "cid" as unknown as CID,
      bytes: new Uint8Array([55, 56, 57, 80]),
    };
    await store.save(car);
  });

  it("should have a car", async () => {
    const data = (await store.realGateway.getPlain({ loader }, store.url(), car.cid.toString())).Ok();
    expect(sthis.txt.decode(data)).toEqual(sthis.txt.decode(car.bytes));
  });

  it("should load a car", async () => {
    const loaded = await store.load(car.cid);
    expect(loaded.cid).toEqual(car.cid);
    expect(loaded.bytes.constructor.name).toEqual("Uint8Array");
    expect(loaded.bytes.toString()).toEqual(car.bytes.toString());
  });

  it("should remove a car", async () => {
    await store.remove(car.cid);
    const { e: error } = (await store.load(car.cid).catch((e: Error) => ({ e }))) as { e: NotFoundError };
    expect(error).toBeTruthy();
  });
});

describe("MetaStore", function () {
  let store: bs.MetaStore;
  const sthis = ensureSuperThis();
  const loader = mockLoader(sthis);

  afterEach(async () => {
    await store.close();
    await store.destroy();
  });

  beforeEach(async () => {
    await sthis.start();
    const at = await createAttachedStores(noopUrl("test"), loader);
    store = at.stores.meta;
    await store.start(at.stores);
  });

  it("should have a name", function () {
    expect(store.url().getParam(PARAM.NAME)).toEqual("test");
  });

  it("should save a header", async () => {
    const cid = CID.parse("bafybeia4luuns6dgymy5kau5rm7r4qzrrzg6cglpzpogussprpy42cmcn4");
    const h: bs.DbMeta = {
      cars: [cid],
      // key: undefined,
    };
    await store.save(h);
    const file = await store.realGateway.getPlain({ loader }, store.url(), "main");
    const blockMeta = (await rt.gw.fpDeserialize(sthis, store.url(), file)) as Result<bs.FPEnvelopeMeta>;
    expect(blockMeta.Ok()).toBeTruthy();
    expect(blockMeta.Ok().payload.length).toEqual(1);
    const decodedHeader = blockMeta.Ok().payload[0].dbMeta;
    expect(decodedHeader).toBeTruthy();
    expect(decodedHeader.cars).toBeTruthy();
    expect(decodedHeader.cars[0].toString()).toEqual(cid.toString());
  });
});

describe("MetaStore with a saved header", function () {
  let store: bs.MetaStore;
  let cid: CID;
  const sthis = ensureSuperThis();
  const loader = mockLoader(sthis);

  afterEach(async () => {
    await store.close();
    await store.destroy();
  });

  beforeEach(async () => {
    await sthis.start();
    const at = await createAttachedStores(noopUrl("test3-meta"), loader);
    store = at.stores.meta;
    await store.start(at.stores);
    cid = CID.parse("bafybeia4luuns6dgymy5kau5rm7r4qzrrzg6cglpzpogussprpy42cmcn4");
    await store.save({ cars: [cid] /*, key: undefined */ });
  });

  // it("should load", async () =>{
  //   expect(onload).toBeTruthy();
  //   expect(onload?.length).toEqual(1);
  //   expect(onload?.[0].cars.toString()).toEqual(cid.toString());
  // });

  it("should have a header", async () => {
    const bytes = await store.realGateway.getPlain({ loader }, store.url(), "main");
    const data = sthis.txt.decode(bytes.Ok());
    expect(data).toMatch(/parents/);
    const header = JSON.parse(data)[0];
    expect(header).toBeDefined();
    expect(header.parents).toBeDefined();
    // const [blockMeta] = await store.handleByteHeads(bytes);

    const blockMeta = (await rt.gw.fpDeserialize(sthis, store.url(), bytes)) as Result<bs.FPEnvelopeMeta>;
    expect(blockMeta.Ok()).toBeTruthy();
    expect(blockMeta.Ok().payload.length).toEqual(1);
    const decodedHeader = blockMeta.Ok().payload[0].dbMeta;
    expect(decodedHeader).toBeDefined();
    expect(decodedHeader.cars).toBeDefined();
    expect(decodedHeader.cars[0].toString()).toEqual(cid.toString());
  });

  it("should load a header", async () => {
    const loadeds = (await store.load()) as bs.DbMeta[];
    const loaded = loadeds[0];
    expect(loaded).toBeTruthy();
    expect(loaded.cars).toBeTruthy();
    expect(loaded.cars.toString()).toEqual(cid.toString());
  });
});

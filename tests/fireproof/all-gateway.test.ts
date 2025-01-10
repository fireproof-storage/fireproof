import { Ledger, LedgerFactory, PARAM, bs, ensureSuperThis } from "@fireproof/core";

import { fileContent } from "./cars/bafkreidxwt2nhvbl4fnqfw3ctlt6zbrir4kqwmjo5im6rf4q5si27kgo2i.js";
import { simpleCID } from "../helpers.js";

// import { DataStore, MetaStore, WALState, WALStore } from "../../src/blockstore/types.js";
// import { Gateway } from "../../src/blockstore/gateway.js";
// import { FPEnvelopeMeta, FPEnvelopeType } from "../../src/blockstore/fp-envelope.js";

// function customExpect(value: unknown, matcher: (val: unknown) => void, message: string): void {
//   try {
//     matcher(value);
//   } catch (error) {
//     void error;
//     // console.error(error);
//     throw new Error(message);
//   }
// }

// interface ExtendedGateway extends bs.Gateway {
//   readonly logger: Logger;
//   readonly headerSize: number;
//   readonly fidLength: number;
// }

// interface ExtendedStore {
//   readonly gateway: ExtendedGateway;
//   readonly _url: URI;
//   readonly name: string;
// }

describe("noop Gateway", function () {
  let db: Ledger;
  let carStore: bs.DataStore;
  let metaStore: bs.MetaStore;
  let fileStore: bs.DataStore;
  let walStore: bs.WALStore;
  let carGateway: bs.Gateway;
  let metaGateway: bs.Gateway;
  let fileGateway: bs.Gateway;
  let walGateway: bs.Gateway;
  const sthis = ensureSuperThis();

  afterEach(async function () {
    await db.close();
    await db.destroy();
  });
  beforeEach(async function () {
    db = LedgerFactory("test-gateway-" + sthis.nextId().str, {
      logger: sthis.logger,
    });

    // Extract stores from the loader
    carStore = (await db.crdt.blockstore.loader?.carStore()) as bs.DataStore;
    metaStore = (await db.crdt.blockstore.loader?.metaStore()) as bs.MetaStore;
    fileStore = (await db.crdt.blockstore.loader?.fileStore()) as bs.DataStore;
    walStore = (await db.crdt.blockstore.loader?.WALStore()) as bs.WALStore;

    // Extract and log gateways
    carGateway = carStore.realGateway;
    metaGateway = metaStore.realGateway;
    fileGateway = fileStore.realGateway;
    walGateway = walStore.realGateway;
  });

  it("should have valid stores and gateways", async function () {
    // Add assertions
    expect(carStore).toBeTruthy();
    expect(metaStore).toBeTruthy();
    expect(fileStore).toBeTruthy();
    expect(walStore).toBeTruthy();

    expect(carGateway).toBeTruthy();
    expect(metaGateway).toBeTruthy();
    expect(fileGateway).toBeTruthy();
    expect(walGateway).toBeTruthy();
  });

  it("should have correct store names", async function () {
    // Check that all stores have the correct name
    expect(carStore.url().getParam(PARAM.NAME)).toContain("test-gateway");
    expect(metaStore.url().getParam(PARAM.NAME)).toContain("test-gateway");
    expect(fileStore.url().getParam(PARAM.NAME)).toContain("test-gateway");
    expect(walStore.url().getParam(PARAM.NAME)).toContain("test-gateway");
  });

  it("should have correct store types in URLs", async function () {
    // Check that all stores have the correct store type in their URL
    expect(carStore.url().toString()).toContain("store=data");
    expect(carStore.url().toString()).toContain("suffix=.car");
    expect(metaStore.url().toString()).toContain("store=meta");
    expect(fileStore.url().toString()).toContain("store=data");
    expect(walStore.url().toString()).toContain("store=wal");
  });

  it("should have version specified in URLs", async function () {
    // Verify that all stores have a version specified
    expect(carStore.url().toString()).toContain("version=");
    expect(metaStore.url().toString()).toContain("version=");
    expect(fileStore.url().toString()).toContain("version=");
    expect(walStore.url().toString()).toContain("version=");
  });

  it("should have correct gateway types", async function () {
    // Check that all gateways are instances of the expected gateway class
    expect(typeof carGateway).toBe("object");
    expect(typeof metaGateway).toBe("object");
    expect(typeof fileGateway).toBe("object");
    expect(typeof walGateway).toBe("object");
  });

  it("should build CAR Gateway URL", async function () {
    const testKey = "bafkreidxwt2nhvbl4fnqfw3ctlt6zbrir4kqwmjo5im6rf4q5si27kgo2i";
    const carUrl = await carGateway.buildUrl(carStore.url(), testKey);
    expect(carUrl.Ok().hasParam("key")).toBeTruthy();
  });

  it("should start CAR Gateway", async function () {
    const url = await carGateway.start(carStore.url());
    expect(url.Ok().asObj()).toEqual(carStore.url().asObj());
  });

  it("should put data in CAR Gateway", async function () {
    const carUrl = await carGateway.buildUrl(carStore.url(), fileContent.cid);
    await carGateway.start(carStore.url());
    const carPutResult = await carGateway.put(carUrl.Ok(), {
      type: bs.FPEnvelopeType.CAR,
      payload: fileContent.block,
    });
    expect(carPutResult.isOk()).toBeTruthy();
  });

  it("should get data from CAR Gateway", async function () {
    const carUrl = await carGateway.buildUrl(carStore.url(), fileContent.cid);
    await carGateway.start(carStore.url());
    await carGateway.put(carUrl.Ok(), {
      type: bs.FPEnvelopeType.CAR,
      payload: fileContent.block,
    });
    const carGetResult = await carGateway.get(carUrl.Ok());
    expect(carGetResult.Ok().type).toEqual("car");
    expect(carGetResult.Ok().payload).toEqual(fileContent.block);
    // customExpect(carGetResult.Ok(), (v) => expect(v).toEqual(testData), "carGetResult should match testData");
  });

  it("should delete data from CAR Gateway", async function () {
    const carUrl = await carGateway.buildUrl(carStore.url(), fileContent.cid);
    await carGateway.start(carStore.url());
    await carGateway.put(carUrl.Ok(), {
      type: bs.FPEnvelopeType.CAR,
      payload: fileContent.block,
    });
    const carDeleteResult = await carGateway.delete(carUrl.Ok());
    expect(carDeleteResult.isOk()).toBeTruthy();
  });

  it("should close CAR Gateway", async function () {
    await carGateway.close(carStore.url());
  });
  it("should build Meta Gateway URL", async function () {
    const metaUrl = await metaGateway.buildUrl(metaStore.url(), "main");
    expect(metaUrl.Ok()).toBeTruthy();
  });

  it("should start Meta Gateway", async function () {
    await metaGateway.start(metaStore.url());
  });

  it("should close Meta Gateway", async function () {
    await metaGateway.start(metaStore.url());
    await metaGateway.close(metaStore.url());
  });

  it("should build File Gateway URL", async function () {
    const fileUrl = await fileGateway.buildUrl(fileStore.url(), fileContent.cid);
    expect(fileUrl.Ok()).toBeTruthy();
  });

  it("should start File Gateway", async function () {
    await fileGateway.start(fileStore.url());
  });

  it("should put data to File Gateway", async function () {
    const fileUrl = await fileGateway.buildUrl(fileStore.url(), fileContent.cid);
    await fileGateway.start(fileStore.url());
    const filePutResult = await fileGateway.put(fileUrl.Ok(), {
      type: bs.FPEnvelopeType.FILE,
      payload: fileContent.block,
    });
    expect(filePutResult.Ok()).toBeFalsy();
  });

  it("should get data from File Gateway", async function () {
    const fileUrl = await fileGateway.buildUrl(fileStore.url(), fileContent.cid);
    await fileGateway.start(fileStore.url());
    await fileGateway.put(fileUrl.Ok(), {
      type: bs.FPEnvelopeType.FILE,
      payload: fileContent.block,
    });
    const fileGetResult = await fileGateway.get(fileUrl.Ok());
    expect(fileGetResult.Ok().type).toEqual("file");
    expect(fileGetResult.Ok().payload).toEqual(fileContent.block);
  });

  it("should delete data from File Gateway", async function () {
    const fileUrl = await fileGateway.buildUrl(fileStore.url(), fileContent.cid);
    await fileGateway.start(fileStore.url());
    await fileGateway.put(fileUrl.Ok(), {
      type: bs.FPEnvelopeType.FILE,
      payload: fileContent.block,
    });
    const fileDeleteResult = await fileGateway.delete(fileUrl.Ok());
    expect(fileDeleteResult.isOk()).toBeTruthy();
  });

  it("should close File Gateway", async function () {
    await fileGateway.close(fileStore.url());
  });
  it("should build WAL Gateway URL", async function () {
    const testKey = "bafkreidxwt2nhvbl4fnqfw3ctlt6zbrir4kqwmjo5im6rf4q5si27kgo2i";
    const walUrl = await walGateway.buildUrl(walStore.url(), testKey);
    expect(walUrl.Ok()).toBeTruthy();
  });

  it("should start WAL Gateway", async function () {
    await walGateway.start(walStore.url());
  });

  it("should put data to WAL Gateway", async function () {
    const testKey = "bafkreidxwt2nhvbl4fnqfw3ctlt6zbrir4kqwmjo5im6rf4q5si27kgo2i";
    const walUrl = await walGateway.buildUrl(walStore.url(), testKey);
    await walGateway.start(walStore.url());
    // const walTestDataString = JSON.stringify();
    // const walTestData = sthis.txt.encode(walTestDataString);
    const walPutResult = await walGateway.put(walUrl.Ok(), {
      type: bs.FPEnvelopeType.WAL,
      payload: {
        operations: [],
        noLoaderOps: [],
        fileOperations: [],
      },
    });
    expect(walPutResult.Ok()).toBeFalsy();
  });

  it("should get data from WAL Gateway", async function () {
    const testKey = "bafkreidxwt2nhvbl4fnqfw3ctlt6zbrir4kqwmjo5im6rf4q5si27kgo2i";
    const walUrl = await walGateway.buildUrl(walStore.url(), testKey);
    await walGateway.start(walStore.url());
    const ref: bs.WALState = {
      operations: [
        {
          cars: [await simpleCID(sthis)],
        },
      ],
      noLoaderOps: [
        {
          cars: [await simpleCID(sthis)],
        },
      ],
      fileOperations: [
        {
          cid: await simpleCID(sthis),
          public: false,
        },
      ],
    };
    // const walTestDataString = JSON.stringify({
    //   operations: [],
    //   noLoaderOps: [],
    //   fileOperations: [],
    // });
    // const walTestData = sthis.txt.encode(walTestDataString);
    await walGateway.put(walUrl.Ok(), {
      type: bs.FPEnvelopeType.WAL,
      payload: ref,
    });
    const walGetResult = await walGateway.get(walUrl.Ok());
    expect(walGetResult.isOk()).toBeTruthy();
    // const okResult = walGetResult.Ok();
    // const decodedResult = sthis.txt.decode(okResult);
    expect(ref).toEqual(walGetResult.Ok().payload);
  });

  it("should delete data from WAL Gateway", async function () {
    const testKey = "bafkreidxwt2nhvbl4fnqfw3ctlt6zbrir4kqwmjo5im6rf4q5si27kgo2i";
    const walUrl = await walGateway.buildUrl(walStore.url(), testKey);
    await walGateway.start(walStore.url());
    const ref: bs.WALState = {
      operations: [
        {
          cars: [await simpleCID(sthis)],
        },
      ],
      noLoaderOps: [
        {
          cars: [await simpleCID(sthis)],
        },
      ],
      fileOperations: [
        {
          cid: await simpleCID(sthis),
          public: false,
        },
      ],
    };
    await walGateway.put(walUrl.Ok(), {
      type: bs.FPEnvelopeType.WAL,
      payload: ref,
    });
    const walDeleteResult = await walGateway.delete(walUrl.Ok());
    expect(walDeleteResult.isOk()).toBeTruthy();
  });

  it("should close WAL Gateway", async function () {
    await walGateway.start(walStore.url());
    await walGateway.close(walStore.url());
  });

  // it("should have correct CAR Gateway properties", async function () {
  //   // CAR Gateway assertions
  //   expect(carGateway.fidLength).toBe(4);
  //   expect(carGateway.headerSize).toBe(36);
  //   carGateway.logger.Error().Msg("CAR Gateway properties");
  //   await sthis.logger.Flush();
  //   const last = sthis.ctx.logCollector.Logs().slice(-1)[0];
  //   expect(last).toHaveProperty("module");
  //   expect(carStore.).toHaveProperty("url");
  // });

  // it("should have correct Meta Gateway properties", async function () {
  //   // Meta Gateway assertions
  //   expect(metaGateway.fidLength).toBe(4);
  //   expect(metaGateway.headerSize).toBe(36);
  //   metaGateway.logger.Error().Msg("CAR Gateway properties");
  //   await sthis.logger.Flush();
  //   const last = sthis.ctx.logCollector.Logs().slice(-1)[0];
  //   expect(last).toHaveProperty("module");
  //   expect(last).not.toHaveProperty("url");
  // });

  // it("should have correct File Gateway properties", async function () {
  //   // File Gateway assertions
  //   expect(fileGateway.fidLength).toBe(4);
  //   expect(fileGateway.headerSize).toBe(36);
  //   fileGateway.logger.Error().Msg("CAR Gateway properties");
  //   await sthis.logger.Flush();
  //   const last = sthis.ctx.logCollector.Logs().slice(-1)[0];
  //   expect(last).toHaveProperty("module");
  //   expect(last).toHaveProperty("url");
  // });

  // it("should have correct WAL Gateway properties", async function () {
  //   // WAL Gateway assertions
  //   expect(walGateway.fidLength).toBe(4);
  //   expect(walGateway.headerSize).toBe(36);
  //   walGateway.logger.Error().Msg("CAR Gateway properties");
  //   await sthis.logger.Flush();
  //   const last = sthis.ctx.logCollector.Logs().slice(-1)[0];
  //   expect(last).toHaveProperty("module");
  //   expect(last).not.toHaveProperty("url");
  // });
});

describe("noop Gateway subscribe", function () {
  let db: Ledger;

  let metaStore: bs.MetaStore;

  let metaGateway: bs.Gateway;
  const sthis = ensureSuperThis();

  afterEach(async function () {
    await db.close();
    await db.destroy();
  });
  beforeEach(async function () {
    db = LedgerFactory("test-gateway-" + sthis.nextId().str);

    // Extract stores from the loader
    metaStore = (await db.crdt.blockstore.loader?.metaStore()) as bs.MetaStore;

    metaGateway = metaStore.realGateway;
  });
  it("should subscribe to meta Gateway", async function () {
    const metaUrl = await metaGateway.buildUrl(metaStore.url(), "main");
    await metaGateway.start(metaStore.url());

    let resolve: () => void;
    let didCall = false;
    const p = new Promise<void>((r) => {
      resolve = r;
    });
    if (metaGateway.subscribe) {
      const metaSubscribeResult = (await metaGateway.subscribe(metaUrl.Ok(), async (data: bs.FPEnvelopeMeta) => {
        // const decodedData = sthis.txt.decode(data);
        expect(data.payload).toContain("[]");
        didCall = true;
        resolve();
      })) as bs.UnsubscribeResult;
      expect(metaSubscribeResult.isOk()).toBeTruthy();
      const ok = await db.put({ _id: "key1", hello: "world1" });
      expect(ok).toBeTruthy();
      expect(ok.id).toBe("key1");
      await p;
      expect(didCall).toBeTruthy();
    }
  });
});

describe("Gateway", function () {
  let db: Ledger;
  // let carStore: ExtendedStore;
  let metaStore: bs.MetaStore;
  // let fileStore: ExtendedStore;
  // let walStore: ExtendedStore;
  // let carGateway: ExtendedGateway;
  let metaGateway: bs.Gateway;
  // let fileGateway: ExtendedGateway;
  // let walGateway: ExtendedGateway;
  const sthis = ensureSuperThis();

  afterEach(async function () {
    await db.close();
    await db.destroy();
  });
  beforeEach(async function () {
    db = LedgerFactory("test-gateway-" + sthis.nextId().str);
    const ok = await db.put({ _id: "test", foo: "bar" });
    expect(ok).toBeTruthy();
    expect(ok.id).toBe("test");

    // Extract stores from the loader
    // carStore = (await db.blockstore.loader.carStore()) as unknown as ExtendedStore;
    metaStore = (await db.crdt.blockstore.loader?.metaStore()) as bs.MetaStore;
    // fileStore = (await db.blockstore.loader.fileStore()) as unknown as ExtendedStore;
    // walStore = (await db.blockstore.loader.WALStore()) as unknown as ExtendedStore;

    // Extract and log gateways
    // carGateway = carStore.gateway;
    metaGateway = metaStore.realGateway;
    // fileGateway = fileStore.gateway;
    // walGateway = walStore.gateway;
  });

  it("should get data from Meta Gateway", async function () {
    const metaUrl = await metaGateway.buildUrl(metaStore.url(), "main");
    await metaGateway.start(metaStore.url());
    const metaGetResult = await metaGateway.get(metaUrl.Ok());
    expect(metaGetResult.isOk()).toBeTruthy();
    const meta = metaGetResult.Ok().payload as bs.DbMetaEvent[];
    // const metaGetResultOk = metaGetResult.Ok();
    // const decodedMetaGetResultOk = sthis.txt.decode(metaGetResultOk);
    expect(meta.length).toBe(1);
    expect(Object.keys(meta[0])).toEqual(["eventCid", "parents", "dbMeta"]);
  });

  it("should delete data from Meta Gateway", async function () {
    const metaUrl = await metaGateway.buildUrl(metaStore.url(), "main");
    await metaGateway.start(metaStore.url());
    // should we be testing .destroy() instead?
    const metaDeleteResult = await metaGateway.delete(metaUrl.Ok());
    expect(metaDeleteResult.isOk()).toBeTruthy();
  });
});

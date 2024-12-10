import { Database, bs, ensureSuperThis } from "@fireproof/core";
import { URI } from "@adviser/cement";

import { fileContent } from "./cars/bafkreidxwt2nhvbl4fnqfw3ctlt6zbrir4kqwmjo5im6rf4q5si27kgo2i.js";

function customExpect(value: unknown, matcher: (val: unknown) => void, message: string): void {
  try {
    matcher(value);
  } catch (error) {
    void error;
    // console.error(error);
    throw new Error(message);
  }
}

interface ExtendedGateway extends bs.Gateway {
  logger: { _attributes: { module: string; url?: string } };
  headerSize: number;
  fidLength: number;
}

interface ExtendedStore {
  gateway: ExtendedGateway;
  _url: URI;
  name: string;
}

describe("noop Gateway", function () {
  let db: Database;
  let carStore: ExtendedStore;
  let metaStore: ExtendedStore;
  let fileStore: ExtendedStore;
  let walStore: ExtendedStore;
  let carGateway: ExtendedGateway;
  let metaGateway: ExtendedGateway;
  let fileGateway: ExtendedGateway;
  let walGateway: ExtendedGateway;

  const sthis = ensureSuperThis();

  afterEach(async function () {
    await db.close();
    await db.destroy();
  });
  beforeEach(async function () {
    db = new Database("test-gateway-" + Math.random().toString(36).substring(7));

    // Extract stores from the loader
    carStore = (await db.blockstore.loader?.carStore()) as unknown as ExtendedStore;
    metaStore = (await db.blockstore.loader?.metaStore()) as unknown as ExtendedStore;
    fileStore = (await db.blockstore.loader?.fileStore()) as unknown as ExtendedStore;
    walStore = (await db.blockstore.loader?.WALStore()) as unknown as ExtendedStore;

    // Extract and log gateways
    carGateway = carStore?.gateway;
    metaGateway = metaStore?.gateway;
    fileGateway = fileStore?.gateway;
    walGateway = walStore?.gateway;
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
    expect(carStore?.name).toContain("test-gateway");
    expect(metaStore?.name).toContain("test-gateway");
    expect(fileStore?.name).toContain("test-gateway");
    expect(walStore?.name).toContain("test-gateway");
  });

  it("should have correct store types in URLs", async function () {
    // Check that all stores have the correct store type in their URL
    expect(carStore?._url.toString()).toContain("store=data");
    expect(metaStore?._url.toString()).toContain("store=meta");
    expect(fileStore?._url.toString()).toContain("store=data");
    expect(walStore?._url.toString()).toContain("store=wal");
  });

  it("should have version specified in URLs", async function () {
    // Verify that all stores have a version specified
    expect(carStore?._url.toString()).toContain("version=");
    expect(metaStore?._url.toString()).toContain("version=");
    expect(fileStore?._url.toString()).toContain("version=");
    expect(walStore?._url.toString()).toContain("version=");
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
    const carUrl = await carGateway?.buildUrl(carStore?._url, testKey);
    expect(carUrl?.Ok()).toBeTruthy();
  });

  it("should start CAR Gateway", async function () {
    await carGateway?.start(carStore?._url);
  });

  it("should put data in CAR Gateway", async function () {
    const testKey = "bafkreidxwt2nhvbl4fnqfw3ctlt6zbrir4kqwmjo5im6rf4q5si27kgo2i";
    const testData = fileContent;
    const carUrl = await carGateway?.buildUrl(carStore?._url, testKey);
    await carGateway?.start(carStore?._url);
    const carPutResult = await carGateway?.put(carUrl?.Ok(), testData);
    expect(carPutResult?.Ok()).toBeFalsy();
  });

  it("should get data from CAR Gateway", async function () {
    const testKey = "bafkreidxwt2nhvbl4fnqfw3ctlt6zbrir4kqwmjo5im6rf4q5si27kgo2i";
    const testData = fileContent;
    const carUrl = await carGateway?.buildUrl(carStore?._url, testKey);
    await carGateway?.start(carStore?._url);
    await carGateway?.put(carUrl?.Ok(), testData);
    const carGetResult = await carGateway?.get(carUrl?.Ok());
    customExpect(carGetResult?.Ok(), (v) => expect(v).toEqual(testData), "carGetResult should match testData");
  });

  it("should delete data from CAR Gateway", async function () {
    const testKey = "bafkreidxwt2nhvbl4fnqfw3ctlt6zbrir4kqwmjo5im6rf4q5si27kgo2i";
    const testData = fileContent;
    const carUrl = await carGateway?.buildUrl(carStore?._url, testKey);
    await carGateway?.start(carStore?._url);
    await carGateway?.put(carUrl?.Ok(), testData);
    const carDeleteResult = await carGateway?.delete(carUrl?.Ok());
    expect(carDeleteResult?.Ok()).toBeFalsy();
  });

  it("should close CAR Gateway", async function () {
    await carGateway?.close(carStore?._url);
  });
  it("should build Meta Gateway URL", async function () {
    const metaUrl = await metaGateway?.buildUrl(metaStore?._url, "main");
    expect(metaUrl?.Ok()).toBeTruthy();
  });

  it("should start Meta Gateway", async function () {
    await metaGateway?.start(metaStore?._url);
  });

  it("should close Meta Gateway", async function () {
    await metaGateway?.start(metaStore?._url);
    await metaGateway?.close(metaStore?._url);
  });

  it("should build File Gateway URL", async function () {
    const testKey = "bafkreidxwt2nhvbl4fnqfw3ctlt6zbrir4kqwmjo5im6rf4q5si27kgo2i";
    const fileUrl = await fileGateway?.buildUrl(fileStore?._url, testKey);
    expect(fileUrl?.Ok()).toBeTruthy();
  });

  it("should start File Gateway", async function () {
    await fileGateway?.start(fileStore?._url);
  });

  it("should put data to File Gateway", async function () {
    const testKey = "bafkreidxwt2nhvbl4fnqfw3ctlt6zbrir4kqwmjo5im6rf4q5si27kgo2i";
    const testData = fileContent;
    const fileUrl = await fileGateway?.buildUrl(fileStore?._url, testKey);
    await fileGateway?.start(fileStore?._url);
    const filePutResult = await fileGateway?.put(fileUrl?.Ok(), testData);
    expect(filePutResult?.Ok()).toBeFalsy();
  });

  it("should get data from File Gateway", async function () {
    const testKey = "bafkreidxwt2nhvbl4fnqfw3ctlt6zbrir4kqwmjo5im6rf4q5si27kgo2i";
    const testData = fileContent;
    const fileUrl = await fileGateway?.buildUrl(fileStore?._url, testKey);
    await fileGateway?.start(fileStore?._url);
    await fileGateway?.put(fileUrl?.Ok(), testData);
    const fileGetResult = await fileGateway?.get(fileUrl?.Ok());
    customExpect(fileGetResult?.Ok(), (v) => expect(v).toEqual(testData), "fileGetResult should match testData");
  });

  it("should delete data from File Gateway", async function () {
    const testKey = "bafkreidxwt2nhvbl4fnqfw3ctlt6zbrir4kqwmjo5im6rf4q5si27kgo2i";
    const testData = fileContent;
    const fileUrl = await fileGateway?.buildUrl(fileStore?._url, testKey);
    await fileGateway?.start(fileStore?._url);
    await fileGateway?.put(fileUrl?.Ok(), testData);
    const fileDeleteResult = await fileGateway?.delete(fileUrl?.Ok());
    expect(fileDeleteResult?.Ok()).toBeFalsy();
  });

  it("should close File Gateway", async function () {
    await fileGateway?.close(fileStore?._url);
  });
  it("should build WAL Gateway URL", async function () {
    const testKey = "bafkreidxwt2nhvbl4fnqfw3ctlt6zbrir4kqwmjo5im6rf4q5si27kgo2i";
    const walUrl = await walGateway?.buildUrl(walStore?._url, testKey);
    expect(walUrl?.Ok()).toBeTruthy();
  });

  it("should start WAL Gateway", async function () {
    await walGateway?.start(walStore?._url);
  });

  it("should put data to WAL Gateway", async function () {
    const testKey = "bafkreidxwt2nhvbl4fnqfw3ctlt6zbrir4kqwmjo5im6rf4q5si27kgo2i";
    const walUrl = await walGateway?.buildUrl(walStore?._url, testKey);
    await walGateway?.start(walStore?._url);
    const walTestDataString = JSON.stringify({
      operations: [],
      noLoaderOps: [],
      fileOperations: [],
    });
    const walTestData = sthis.txt.encode(walTestDataString);
    const walPutResult = await walGateway?.put(walUrl?.Ok(), walTestData);
    expect(walPutResult?.Ok()).toBeFalsy();
  });

  it("should get data from WAL Gateway", async function () {
    const testKey = "bafkreidxwt2nhvbl4fnqfw3ctlt6zbrir4kqwmjo5im6rf4q5si27kgo2i";
    const walUrl = await walGateway?.buildUrl(walStore?._url, testKey);
    await walGateway?.start(walStore?._url);
    const walTestDataString = JSON.stringify({
      operations: [],
      noLoaderOps: [],
      fileOperations: [],
    });
    const walTestData = sthis.txt.encode(walTestDataString);
    await walGateway?.put(walUrl?.Ok(), walTestData);
    const walGetResult = await walGateway?.get(walUrl?.Ok());
    const okResult = walGetResult?.Ok();
    const decodedResult = sthis.txt.decode(okResult);
    expect(decodedResult).toEqual(walTestDataString);
  });

  it("should delete data from WAL Gateway", async function () {
    const testKey = "bafkreidxwt2nhvbl4fnqfw3ctlt6zbrir4kqwmjo5im6rf4q5si27kgo2i";
    const walUrl = await walGateway?.buildUrl(walStore?._url, testKey);
    await walGateway?.start(walStore?._url);
    const walTestDataString = JSON.stringify({
      operations: [],
      noLoaderOps: [],
      fileOperations: [],
    });
    const walTestData = sthis.txt.encode(walTestDataString);
    await walGateway?.put(walUrl?.Ok(), walTestData);
    const walDeleteResult = await walGateway?.delete(walUrl?.Ok());
    expect(walDeleteResult?.Ok()).toBeFalsy();
  });

  it("should close WAL Gateway", async function () {
    await walGateway?.start(walStore?._url);
    await walGateway?.close(walStore?._url);
  });

  it("should have correct CAR Gateway properties", async function () {
    // CAR Gateway assertions
    expect(carGateway?.fidLength).toBe(4);
    expect(carGateway?.headerSize).toBe(36);
    expect(carGateway?.logger._attributes).toHaveProperty("module");
    expect(carGateway?.logger._attributes).toHaveProperty("url");
  });

  it("should have correct Meta Gateway properties", async function () {
    // Meta Gateway assertions
    expect(metaGateway?.fidLength).toBe(4);
    expect(metaGateway?.headerSize).toBe(36);
    expect(metaGateway?.logger._attributes).toHaveProperty("module");
    expect(metaGateway?.logger._attributes).not.toHaveProperty("url");
  });

  it("should have correct File Gateway properties", async function () {
    // File Gateway assertions
    expect(fileGateway?.fidLength).toBe(4);
    expect(fileGateway?.headerSize).toBe(36);
    expect(fileGateway?.logger._attributes).toHaveProperty("module");
    expect(fileGateway?.logger._attributes).toHaveProperty("url");
  });

  it("should have correct WAL Gateway properties", async function () {
    // WAL Gateway assertions
    expect(walGateway?.fidLength).toBe(4);
    expect(walGateway?.headerSize).toBe(36);
    expect(walGateway?.logger._attributes).toHaveProperty("module");
    expect(walGateway?.logger._attributes).not.toHaveProperty("url");
  });
});

describe("noop Gateway subscribe", function () {
  let db: Database;

  let metaStore: ExtendedStore;

  let metaGateway: ExtendedGateway;
  const sthis = ensureSuperThis();

  afterEach(async function () {
    await db.close();
    await db.destroy();
  });
  beforeEach(async function () {
    db = new Database("test-gateway-" + Math.random().toString(36).substring(7));

    // Extract stores from the loader
    metaStore = (await db.blockstore.loader?.metaStore()) as unknown as ExtendedStore;

    metaGateway = metaStore?.gateway;
  });
  it("should subscribe to meta Gateway", async function () {
    const metaUrl = await metaGateway?.buildUrl(metaStore?._url, "main");
    await metaGateway?.start(metaStore?._url);

    let resolve: () => void;
    let didCall = false;
    const p = new Promise<void>((r) => {
      resolve = r;
    });
    const metaSubscribeResult = await metaGateway?.subscribe?.(metaUrl?.Ok(), async (data: Uint8Array) => {
      const decodedData = sthis.txt.decode(data);
      expect(decodedData).toContain("[]");
      didCall = true;
      resolve();
    });
    if (!metaSubscribeResult?.isErr()) {
      expect(metaSubscribeResult?.Ok()).toBeTruthy();
      const ok = await db.put({ _id: "key1", hello: "world1" });
      expect(ok).toBeTruthy();
      expect(ok.id).toBe("key1");
      await p;
      expect(didCall).toBeTruthy();
    }
  });
});

describe("Gateway", function () {
  let db: Database;
  // let carStore: ExtendedStore;
  let metaStore: ExtendedStore;
  // let fileStore: ExtendedStore;
  // let walStore: ExtendedStore;
  // let carGateway: ExtendedGateway;
  let metaGateway: ExtendedGateway;
  // let fileGateway: ExtendedGateway;
  // let walGateway: ExtendedGateway;
  const sthis = ensureSuperThis();

  afterEach(async function () {
    await db.close();
    await db.destroy();
  });
  beforeEach(async function () {
    db = new Database("test-gateway-" + Math.random().toString(36).substring(7));
    const ok = await db.put({ _id: "test", foo: "bar" });
    expect(ok).toBeTruthy();
    expect(ok.id).toBe("test");

    // Extract stores from the loader
    // carStore = (await db.blockstore.loader?.carStore()) as unknown as ExtendedStore;
    metaStore = (await db.blockstore.loader?.metaStore()) as unknown as ExtendedStore;
    // fileStore = (await db.blockstore.loader?.fileStore()) as unknown as ExtendedStore;
    // walStore = (await db.blockstore.loader?.WALStore()) as unknown as ExtendedStore;

    // Extract and log gateways
    // carGateway = carStore?.gateway;
    metaGateway = metaStore?.gateway;
    // fileGateway = fileStore?.gateway;
    // walGateway = walStore?.gateway;
  });

  it("should get data from Meta Gateway", async function () {
    const metaUrl = await metaGateway?.buildUrl(metaStore?._url, "main");
    await metaGateway?.start(metaStore?._url);
    const metaGetResult = await metaGateway?.get(metaUrl?.Ok());
    const metaGetResultOk = metaGetResult?.Ok();
    const decodedMetaGetResultOk = sthis.txt.decode(metaGetResultOk);
    expect(decodedMetaGetResultOk).toContain("parents");
  });

  it("should delete data from Meta Gateway", async function () {
    const metaUrl = await metaGateway?.buildUrl(metaStore?._url, "main");
    await metaGateway?.start(metaStore?._url);
    // should we be testing .destroy() instead?
    const metaDeleteResult = await metaGateway?.delete(metaUrl?.Ok());
    expect(metaDeleteResult?.Ok()).toBeFalsy();
  });
});

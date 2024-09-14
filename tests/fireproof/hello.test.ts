import { fireproof as database, Database, DocResponse, DocWithId, bs, Logger } from "@fireproof/core";
import { URI } from "@adviser/cement";

describe("Hello World Test", function () {
  it("should pass the hello world test", function () {
    const result = database("hello"); // call to your library function
    expect(result.name).toBe("hello");
  });
});

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

describe("hello public API", function () {
  interface TestDoc {
    foo: string;
  }
  let db: Database;
  let ok: DocResponse;
  let doc: DocWithId<TestDoc>;
  afterEach(async function () {
    await db.close();
    await db.destroy();
  });
  beforeEach(async function () {
    db = database("test-public-api");
    ok = await db.put({ _id: "test", foo: "bar" });
    doc = await db.get("test");
  });
  it("should have a database", function () {
    expect(db).toBeTruthy();
    expect(db instanceof Database).toBeTruthy();
  });
  it("should put", function () {
    expect(ok).toBeTruthy();
    expect(ok.id).toBe("test");
  });
  it("should get", function () {
    expect(doc.foo).toBe("bar");
  });
  it("should get when you open it again", async function () {
    await db.close();
    await db.destroy();
    const db2 = database("test-public-api");
    doc = await db2.get("test");
    expect(doc.foo).toBe("bar");
  });
});

describe("Simplified Reopening a database", function () {
  let db: Database;
  afterEach(async function () {
    await db.close();
    await db.destroy();
  });
  beforeEach(async function () {
    db = new Database("test-reopen-simple");
    const ok = await db.put({ _id: "test", foo: "bar" });
    expect(ok).toBeTruthy();
    expect(ok.id).toBe("test");
  });

  it("should persist data", async function () {
    const doc = await db.get<{ foo: string }>("test");
    expect(doc.foo).toBe("bar");
  });

  it("should behave like a gateway", async function () {
    // Extract stores from the loader
    const carStore = (await db.blockstore.loader?.carStore()) as unknown as ExtendedStore;
    const metaStore = (await db.blockstore.loader?.metaStore()) as unknown as ExtendedStore;
    const fileStore = (await db.blockstore.loader?.fileStore()) as unknown as ExtendedStore;
    const walStore = (await db.blockstore.loader?.WALStore()) as unknown as ExtendedStore;

    // Extract and log gateways
    const carGateway = carStore?.gateway;
    const metaGateway = metaStore?.gateway;
    const fileGateway = fileStore?.gateway;
    const walGateway = walStore?.gateway;

    // Add assertions
    expect(carStore).toBeTruthy();
    expect(metaStore).toBeTruthy();
    expect(fileStore).toBeTruthy();
    expect(walStore).toBeTruthy();

    expect(carGateway).toBeTruthy();
    expect(metaGateway).toBeTruthy();
    expect(fileGateway).toBeTruthy();
    expect(walGateway).toBeTruthy();

    // Check that all stores have the correct name
    expect(carStore?.name).toBe("test-reopen-simple");
    expect(metaStore?.name).toBe("test-reopen-simple");
    expect(fileStore?.name).toBe("test-reopen-simple");
    expect(walStore?.name).toBe("test-reopen-simple");

    // Check that all stores have the correct store type in their URL
    expect(carStore?._url.toString()).toContain("store=data");
    expect(metaStore?._url.toString()).toContain("store=meta");
    expect(fileStore?._url.toString()).toContain("store=data");
    expect(walStore?._url.toString()).toContain("store=wal");

    // Verify that all stores have a version specified
    expect(carStore?._url.toString()).toContain("version=");
    expect(metaStore?._url.toString()).toContain("version=");
    expect(fileStore?._url.toString()).toContain("version=");
    expect(walStore?._url.toString()).toContain("version=");

    // Check that all gateways are instances of the expected gateway class
    // Note: You might need to import the specific gateway classes and use instanceof
    // For example: expect(carGateway instanceof SpecificGatewayClass).toBe(true);
    expect(typeof carGateway).toBe("object");
    expect(typeof metaGateway).toBe("object");
    expect(typeof fileGateway).toBe("object");
    expect(typeof walGateway).toBe("object");

    // CAR Gateway assertions
    expect(carGateway?.fidLength).toBe(4);
    expect(carGateway?.headerSize).toBe(36);

    expect(carGateway?.logger._attributes).toHaveProperty("module");
    expect(carGateway?.logger._attributes).toHaveProperty("url");

    // Meta Gateway assertions
    expect(metaGateway?.fidLength).toBe(4);
    expect(metaGateway?.headerSize).toBe(36);

    expect(metaGateway?.logger._attributes).toHaveProperty("module");
    expect(metaGateway?.logger._attributes).not.toHaveProperty("url");

    // File Gateway assertions
    expect(fileGateway?.fidLength).toBe(4);
    expect(fileGateway?.headerSize).toBe(36);

    expect(fileGateway?.logger._attributes).toHaveProperty("module");
    expect(fileGateway?.logger._attributes).toHaveProperty("url");

    // WAL Gateway assertions
    expect(walGateway?.fidLength).toBe(4);
    expect(walGateway?.headerSize).toBe(36);

    expect(walGateway?.logger._attributes).toHaveProperty("module");
    expect(walGateway?.logger._attributes).not.toHaveProperty("url");

    // Interact with each gateway type
    const testData = new Uint8Array([1, 2, 3, 4, 5]);
    const testKey = "testKey";

    // CAR Gateway
    const carUrl = await carGateway?.buildUrl(carStore?._url, testKey);
    expect(carUrl?.Ok()).toBeTruthy();

    await carGateway?.start(carStore?._url);

    const carPutResult = await carGateway?.put(carUrl?.Ok(), testData);
    expect(carPutResult?.Ok()).toBeFalsy();

    const carGetResult = await carGateway?.get(carUrl?.Ok());
    expect(carGetResult?.Ok()).toEqual(testData);

    const carDeleteResult = await carGateway?.delete(carUrl?.Ok());
    expect(carDeleteResult?.Ok()).toBeFalsy();

    await carGateway?.close(carStore?._url);

    // Meta Gateway
    const metaUrl = await metaGateway?.buildUrl(metaStore?._url, testKey);
    // expect(metaUrl.Ok()).toBeTruthy();

    await metaGateway?.start(metaStore?._url);

    const metaPutResult = await metaGateway?.put(metaUrl?.Ok(), testData);
    expect(metaPutResult?.Ok()).toBeFalsy();

    const metaGetResult = await metaGateway?.get(metaUrl?.Ok());
    expect(metaGetResult?.Ok()).toEqual(testData);

    const metaDeleteResult = await metaGateway?.delete(metaUrl?.Ok());
    expect(metaDeleteResult?.Ok()).toBeFalsy();

    await metaGateway?.close(metaStore?._url);

    // File Gateway
    const fileUrl = await fileGateway?.buildUrl(fileStore?._url, testKey);
    expect(fileUrl?.Ok()).toBeTruthy();

    await fileGateway?.start(fileStore?._url);

    const filePutResult = await fileGateway?.put(fileUrl?.Ok(), testData);
    expect(filePutResult?.Ok()).toBeFalsy();

    const fileGetResult = await fileGateway?.get(fileUrl?.Ok());
    expect(fileGetResult?.Ok()).toEqual(testData);

    const fileDeleteResult = await fileGateway?.delete(fileUrl?.Ok());
    expect(fileDeleteResult?.Ok()).toBeFalsy();

    await fileGateway?.close(fileStore?._url);

    // WAL Gateway
    const walUrl = await walGateway?.buildUrl(walStore?._url, testKey);
    expect(walUrl?.Ok()).toBeTruthy();

    await walGateway?.start(walStore?._url);

    const walPutResult = await walGateway?.put(walUrl?.Ok(), testData);
    expect(walPutResult?.Ok()).toBeFalsy();

    const walGetResult = await walGateway?.get(walUrl?.Ok());
    expect(walGetResult?.Ok()).toEqual(testData);

    const walDeleteResult = await walGateway?.delete(walUrl?.Ok());
    expect(walDeleteResult?.Ok()).toBeFalsy();

    await walGateway?.close(walStore?._url);

    // Test subscribe method for Meta Gateway (if implemented)
    // if (metaGateway.subscribe) {
    //   const subscribeResult = await metaGateway.subscribe(metaStore._url, () => {});
    //   expect(subscribeResult.Ok()).toBeFalsy();
    // }
  });

  it("should have the same data on reopen", async function () {
    const db2 = new Database("test-reopen-simple");
    const doc = await db2.get<{ foo: string }>("test");
    expect(doc.foo).toBe("bar");
    await db2.close();
  });
});

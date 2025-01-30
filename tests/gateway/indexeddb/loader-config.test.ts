import { fireproof } from "@fireproof/core";
import { mockSuperThis } from "../../helpers.js";

describe("fireproof config indexeddb", () => {
  const _my_app = "my-app";
  function my_app() {
    return _my_app;
  }
  const sthis = mockSuperThis();
  beforeAll(async () => {
    await sthis.start();
  });

  it("indexeddb-loader", async () => {
    const db = fireproof(my_app());
    await db.put({ name: "my-app" });
    expect(db.ledger.name).toBe(my_app());

    const fileStore = await db.ledger.crdt.blockstore.loader.fileStore();
    expect(fileStore?.url().asObj()).toEqual({
      pathname: "fp",
      protocol: "indexeddb:",
      searchParams: {
        name: "my-app",
        store: "data",
        runtime: "browser",
        storekey: "@my-app-data@",
        urlGen: "default",
        version: "v0.19-indexeddb",
      },
      style: "path",
    });

    const dataStore = await db.ledger.crdt.blockstore.loader.carStore();
    expect(dataStore?.url().asObj()).toEqual({
      pathname: "fp",
      protocol: "indexeddb:",
      searchParams: {
        name: "my-app",
        store: "data",
        runtime: "browser",
        storekey: "@my-app-data@",
        suffix: ".car",
        urlGen: "default",
        version: "v0.19-indexeddb",
      },
      style: "path",
    });
    const metaStore = await db.ledger.crdt.blockstore.loader.metaStore();
    expect(metaStore?.url().asObj()).toEqual({
      pathname: "fp",
      protocol: "indexeddb:",
      searchParams: {
        name: "my-app",
        store: "meta",
        runtime: "browser",
        storekey: "@my-app-meta@",
        urlGen: "default",
        version: "v0.19-indexeddb",
      },
      style: "path",
    });
    const WALStore = await db.ledger.crdt.blockstore.loader.WALStore();
    expect(WALStore?.url().asObj()).toEqual({
      pathname: "fp",
      protocol: "indexeddb:",
      searchParams: {
        name: "my-app",
        store: "wal",
        runtime: "browser",
        storekey: "@my-app-wal@",
        urlGen: "default",
        version: "v0.19-indexeddb",
      },
      style: "path",
    });
    await db.close();
  });
});

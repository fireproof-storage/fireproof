import { fireproof } from "@fireproof/core";
import { mockSuperThis } from "../../helpers.js";
import { describe, beforeAll, it, expect } from "vitest";
import { Env } from "@adviser/cement";

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
    const env = (globalThis as unknown as Record<symbol, Record<string, string>>)[Symbol.for("FP_ENV")] as unknown as Env;
    const pre = env.get("FP_STORAGE_URL");
    env.delete("FP_STORAGE_URL");
    const db = fireproof(my_app());
    env.set("FP_STORAGE_URL", pre);
    await db.put({ name: "my-app" });
    expect(db.ledger.name).toBe(my_app());

    const fileStore = await db.ledger.crdt.blockstore.loader.attachedStores.local().active.file;
    expect(fileStore?.url().asObj()).toEqual({
      pathname: "fp",
      protocol: "indexeddb:",
      searchParams: {
        name: "my-app",
        store: "file",
        runtime: "browser",
        storekey: "@my-app-data@",
        urlGen: "default",
        version: "v0.19-indexeddb",
      },
      style: "path",
    });

    const dataStore = await db.ledger.crdt.blockstore.loader.attachedStores.local().active.car;
    expect(dataStore?.url().asObj()).toEqual({
      pathname: "fp",
      protocol: "indexeddb:",
      searchParams: {
        name: "my-app",
        store: "car",
        runtime: "browser",
        storekey: "@my-app-data@",
        suffix: ".car",
        urlGen: "default",
        version: "v0.19-indexeddb",
      },
      style: "path",
    });
    const metaStore = await db.ledger.crdt.blockstore.loader.attachedStores.local().active.meta;
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
    const WALStore = await db.ledger.crdt.blockstore.loader.attachedStores.local().active.wal;
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

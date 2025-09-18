import { fireproof } from "@fireproof/core";
import { describe, expect, it, vi } from "vitest";
import { Dexie } from "dexie";
import { consumeStream, ensureSuperThis, runtimeFn } from "@fireproof/core-runtime";
import { defaultGatewayFactoryItem } from "@fireproof/core-blockstore";

describe("dexie", () => {
  const sthis = ensureSuperThis();
  const gw = defaultGatewayFactoryItem();
  it("should work", async () => {
    Dexie.delete("fp.test-dexie");
    const x = fireproof("test-dexie");
    await x.put({ _id: "test", foo: "bar" });
    await x.close();
    // const ddb = new FPIndexedDB("fp.test-dexie");

    if (runtimeFn().isBrowser) {
      const url = gw.defaultURI(sthis).build().pathname("fp.test-dexie").URI();
      // console.log("url", url.toString());
      const ddb = await gw.fpIndexedDB(sthis, url);
      const dataFn = vi.fn();
      const metaFn = vi.fn();
      const walFn = vi.fn();
      await consumeStream(ddb.version().list(), (doc) => {
        expect(doc.version).toBeDefined();
      });
      await consumeStream(ddb.objectStore("data").list(), dataFn);
      await consumeStream(ddb.objectStore("meta").list(), metaFn);
      await consumeStream(ddb.objectStore("wal").list(), walFn);
      expect(dataFn).toHaveBeenCalled();
      expect(metaFn).toHaveBeenCalledTimes(1);
      expect(walFn).toHaveBeenCalledTimes(1);
    }

    const y = fireproof("test-dexie");
    const { rows } = await y.allDocs();
    expect(rows.length).toBe(1);
    await y.close();
    if (runtimeFn().isBrowser) {
      const ddb = await gw.fpIndexedDB(sthis, gw.defaultURI(sthis).build().pathname("fp.test-dexie").URI());
      const dataFn = vi.fn();
      const metaFn = vi.fn();
      const walFn = vi.fn();
      await consumeStream(ddb.version().list(), (doc) => {
        expect(doc.version).toBeDefined();
      });
      await consumeStream(ddb.objectStore("data").list(), dataFn);
      await consumeStream(ddb.objectStore("meta").list(), metaFn);
      await consumeStream(ddb.objectStore("wal").list(), walFn);
      expect(dataFn).toHaveBeenCalled();
      expect(metaFn).toHaveBeenCalledTimes(1);
      expect(walFn).toHaveBeenCalledTimes(1);
    }
  });
});

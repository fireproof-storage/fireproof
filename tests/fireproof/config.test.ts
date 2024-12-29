import { describe, it, expect, beforeAll } from "vitest";
import { dataDir, ensureSuperThis, fireproof, rt, SysFileSystem } from "@fireproof/core";
import { runtimeFn, URI } from "@adviser/cement";

let _my_app = "my-app";
function my_app() {
  return _my_app;
}

if (runtimeFn().isNodeIsh) {
  describe("fireproof/config", () => {
    function params(store: string) {
      return Object.entries({
        store,
        name: my_app(),
        storekey: `@${my_app()}:${store}@`,
        version: rt.FILESTORE_VERSION,
      });
    }
    const sthis = ensureSuperThis();
    let getFileSystem: (url: URI) => Promise<SysFileSystem>;
    beforeAll(async () => {
      await sthis.start();
      if (runtimeFn().isNodeIsh) {
        const fpStorageUrl = sthis.env.get("FP_STORAGE_URL");
        if (fpStorageUrl) {
          const url = URI.from(fpStorageUrl);
          _my_app = `my-app-${url.protocol.replace(/:$/, "")}:${url.getParam("fs") || "fs"}`;
        }
      }
      const node = await import("@fireproof/core/node");
      getFileSystem = node.getFileSystem;
    });

    it("node default", async () => {
      const old = sthis.env.get("FP_STORAGE_URL");
      sthis.env.delete("FP_STORAGE_URL");
      let baseDir = dataDir(sthis, my_app()).pathname;
      baseDir = sthis.pathOps.join(baseDir, rt.FILESTORE_VERSION, my_app());

      const sysfs = await getFileSystem(URI.from(baseDir));
      await sysfs.rm(baseDir, { recursive: true }).catch(() => {
        /* */
      });

      expect(baseDir).toMatch(new RegExp(`/\\.fireproof/${rt.FILESTORE_VERSION}/${my_app()}`));

      const db = fireproof(my_app());
      await db.put({ name: "my-app" });
      expect(db.name).toBe(my_app());
      const carStore = await db.blockstore.loader?.carStore();

      for (const [param, value] of Object.entries({
        store: "data",
        name: my_app(),
        storekey: `@${my_app()}:data@`,
        version: rt.FILESTORE_VERSION,
      })) {
        expect(carStore?.url().getParam(param)).toBe(value);
      }
      expect((await sysfs.stat(sthis.pathOps.join(baseDir, "data"))).isDirectory()).toBeTruthy();

      const fileStore = await db.blockstore.loader?.fileStore();
      for (const [param, value] of params("data")) {
        expect(fileStore?.url().getParam(param)).toBe(value);
      }
      const metaStore = await db.blockstore.loader?.metaStore();
      for (const [param, value] of params("meta")) {
        expect(metaStore?.url().getParam(param)).toBe(value);
      }
      expect((await sysfs.stat(sthis.pathOps.join(baseDir, "meta"))).isDirectory()).toBeTruthy();
      sthis.env.set("FP_STORAGE_URL", old);
      await db.close();
    });

    it("set by env", async () => {
      const old = sthis.env.get("FP_STORAGE_URL");
      const testUrl = URI.merge(`./dist/env`, old);
      sthis.env.set("FP_STORAGE_URL", testUrl.toString());

      let baseDir = dataDir(sthis, my_app()).pathname;
      baseDir = sthis.pathOps.join(baseDir, rt.FILESTORE_VERSION, my_app());

      const sysfs = await getFileSystem(testUrl);
      await sysfs.rm(baseDir, { recursive: true }).catch(() => {
        /* */
      });

      const db = fireproof(my_app());
      await db.put({ name: "my-app" });
      expect(db.name).toBe(my_app());
      const carStore = await db.blockstore.loader?.carStore();
      for (const [param, value] of params("data")) {
        expect(carStore?.url().getParam(param)).toBe(value);
      }
      expect((await sysfs.stat(sthis.pathOps.join(baseDir, "data"))).isDirectory()).toBeTruthy();
      const fileStore = await db.blockstore.loader?.fileStore();
      for (const [param, value] of params("data")) {
        expect(fileStore?.url().getParam(param)).toBe(value);
      }
      const metaStore = await db.blockstore.loader?.metaStore();
      for (const [param, value] of params("meta")) {
        expect(metaStore?.url().getParam(param)).toBe(value);
      }
      expect((await sysfs.stat(sthis.pathOps.join(baseDir, "meta"))).isDirectory()).toBeTruthy();
      await db.close();
      sthis.env.set("FP_STORAGE_URL", old);
    });

    it("file path", async () => {
      let baseDir = "./dist/data".replace(/\?.*$/, "").replace(/^file:\/\//, "");
      baseDir = sthis.pathOps.join(baseDir, rt.FILESTORE_VERSION, my_app());

      const base = "./dist/data";
      const sysfs = await getFileSystem(URI.from(base));
      await sysfs.rm(baseDir, { recursive: true }).catch(() => {
        /* */
      });

      const db = fireproof(my_app(), { store: { stores: { base } } });
      // console.log(`>>>>>>>>>>>>>>>file-path`)
      await db.put({ name: "my-app" });
      expect(db.name).toBe(my_app());
      const carStore = await db.blockstore.loader?.carStore();
      for (const [param, value] of params("data")) {
        expect(carStore?.url().getParam(param)).toBe(value);
      }
      const fileStore = await db.blockstore.loader?.fileStore();
      for (const [param, value] of params("data")) {
        expect(fileStore?.url().getParam(param)).toBe(value);
      }
      expect((await sysfs.stat(sthis.pathOps.join(baseDir, "data"))).isDirectory()).toBeTruthy();
      const metaStore = await db.blockstore.loader?.metaStore();
      for (const [param, value] of params("meta")) {
        expect(metaStore?.url().getParam(param)).toBe(value);
      }
      expect((await sysfs.stat(sthis.pathOps.join(baseDir, "meta"))).isDirectory()).toBeTruthy();
      await db.close();
    });
  });
} else {
  it("default", async () => {
    const db = fireproof(my_app());
    await db.put({ name: "my-app" });
    expect(db.name).toBe(my_app());

    const fileStore = await db.blockstore.loader?.fileStore();
    expect(fileStore?.url().toString()).toMatch(
      new RegExp(`indexdb://fp\\?name=my-app&store=data&storekey=%40my-app%3Adata%40&version=${rt.INDEXDB_VERSION}`),
    );
    const metaStore = await db.blockstore.loader?.metaStore();
    expect(metaStore?.url().toString()).toMatch(
      new RegExp(`indexdb://fp\\?name=my-app&store=meta&storekey=%40my-app%3Ameta%40&version=${rt.INDEXDB_VERSION}`),
    );

    const carStore = await db.blockstore.loader?.carStore();
    expect(carStore?.url().toString()).toMatch(
      new RegExp(`indexdb://fp\\?name=my-app&store=data&storekey=%40my-app%3Adata%40&version=${rt.INDEXDB_VERSION}`),
    );

    await db.close();
  });
}

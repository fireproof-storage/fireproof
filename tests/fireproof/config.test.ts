import { describe, it, expect, beforeAll } from "vitest";
import { dataDir, fireproof, rt } from "@fireproof/core";
import { runtimeFn, URI } from "@adviser/cement";

describe("runtime", () => {
  it("runtime", () => {
    const isNode = !!(typeof process === "object" && process.versions?.node);
    expect(runtimeFn()).toEqual({
      isBrowser: !isNode,
      isDeno: false,
      isNodeIsh: isNode,
      isReactNative: false,
    });
  });
});

describe("fireproof/config", () => {
  let _my_app = "my-app";
  function my_app() {
    return _my_app;
  }
  function params(store: string) {
    return Object.entries({
      store,
      name: my_app(),
      storekey: `@${my_app()}:${store}@`,
      version: rt.FILESTORE_VERSION,
    });
  }
  beforeAll(async () => {
    await rt.SysContainer.start();
    if (runtimeFn().isNodeIsh) {
      const fpStorageUrl = rt.SysContainer.env.get("FP_STORAGE_URL");
      if (fpStorageUrl) {
        const url = URI.from(fpStorageUrl);
        _my_app = `my-app-${url.protocol.replace(/:$/, "")}:${url.getParam("fs") || "fs"}`;
      }
    }
  });

  if (!runtimeFn().isNodeIsh) {
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
    return;
  }
  it("node default", async () => {
    const old = rt.SysContainer.env.get("FP_STORAGE_URL");
    rt.SysContainer.env.delete("FP_STORAGE_URL");
    let baseDir = dataDir(my_app()).pathname;
    baseDir = rt.SysContainer.join(baseDir, rt.FILESTORE_VERSION, my_app());
    await rt.SysContainer.rm(baseDir, { recursive: true }).catch(() => {
      /* */
    });

    const sysfs = await rt.getFileSystem(URI.from(baseDir));

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
    expect((await sysfs.stat(rt.SysContainer.join(baseDir, "data"))).isDirectory()).toBeTruthy();

    const fileStore = await db.blockstore.loader?.fileStore();
    for (const [param, value] of params("data")) {
      expect(fileStore?.url().getParam(param)).toBe(value);
    }
    const metaStore = await db.blockstore.loader?.metaStore();
    for (const [param, value] of params("meta")) {
      expect(metaStore?.url().getParam(param)).toBe(value);
    }
    expect((await sysfs.stat(rt.SysContainer.join(baseDir, "meta"))).isDirectory()).toBeTruthy();
    rt.SysContainer.env.set("FP_STORAGE_URL", old);
    await db.close();
  });

  it("set by env", async () => {
    const old = rt.SysContainer.env.get("FP_STORAGE_URL");
    const testUrl = URI.merge(`./dist/env`, old);
    rt.SysContainer.env.set("FP_STORAGE_URL", testUrl.toString());

    let baseDir = dataDir(my_app()).pathname;
    baseDir = rt.SysContainer.join(baseDir, rt.FILESTORE_VERSION, my_app());

    const sysfs = await rt.getFileSystem(testUrl);
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
    expect((await sysfs.stat(rt.SysContainer.join(baseDir, "data"))).isDirectory()).toBeTruthy();
    const fileStore = await db.blockstore.loader?.fileStore();
    for (const [param, value] of params("data")) {
      expect(fileStore?.url().getParam(param)).toBe(value);
    }
    const metaStore = await db.blockstore.loader?.metaStore();
    for (const [param, value] of params("meta")) {
      expect(metaStore?.url().getParam(param)).toBe(value);
    }
    expect((await sysfs.stat(rt.SysContainer.join(baseDir, "meta"))).isDirectory()).toBeTruthy();
    await db.close();
    rt.SysContainer.env.set("FP_STORAGE_URL", old);
  });

  it("file path", async () => {
    let baseDir = "./dist/data".replace(/\?.*$/, "").replace(/^file:\/\//, "");
    baseDir = rt.SysContainer.join(baseDir, rt.FILESTORE_VERSION, my_app());

    await rt.SysContainer.rm(baseDir, { recursive: true }).catch(() => {
      /* */
    });

    const db = fireproof(my_app(), {
      store: {
        stores: {
          base: "./dist/data",
        },
      },
    });
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
    expect((await rt.SysContainer.stat(rt.SysContainer.join(baseDir, "data"))).isDirectory()).toBeTruthy();
    const metaStore = await db.blockstore.loader?.metaStore();
    for (const [param, value] of params("meta")) {
      expect(metaStore?.url().getParam(param)).toBe(value);
    }
    expect((await rt.SysContainer.stat(rt.SysContainer.join(baseDir, "meta"))).isDirectory()).toBeTruthy();
    await db.close();
  });
});

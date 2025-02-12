import { BuildURI, CoerceURI, runtimeFn, URI } from "@adviser/cement";
import { fireproof, PARAM, rt, SuperThis } from "@fireproof/core";
import { mockSuperThis } from "../../helpers.js";

function dataDir(sthis: SuperThis, name?: string, base?: CoerceURI): URI {
  if (!base) {
    const home = sthis.env.get("HOME") || "./";
    base =
      sthis.env.get("FP_STORAGE_URL") ||
      `file://${sthis.pathOps.join(home, ".fireproof", rt.FILESTORE_VERSION.replace(/-.*$/, ""))}?${PARAM.URL_GEN}=default`;
  }
  return URI.from(base.toString())
    .build()
    .setParam(PARAM.NAME, name || "")
    .URI();
}

const _my_app = "my-app";
function my_app() {
  return _my_app;
}

describe("config file gateway", () => {
  const sthis = mockSuperThis();
  // const isMemFS: { fs?: string } = {};

  beforeAll(async () => {
    await sthis.start();
    // const url = URI.from(sthis.env.get("FP_STORAGE_URL"));
    // if (url.getParam("fs") === "mem") {
    //   isMemFS.fs = "mem";
    // }
  });

  it("loader", async () => {
    const db = fireproof(my_app());
    await db.put({ name: "my-app" });
    expect(db.ledger.name).toBe(my_app());

    const fileStore = await db.ledger.crdt.blockstore.loader.attachedStores.local().active.file;
    expect(fileStore?.url().asObj()).toEqual({
      pathname: "./dist/fp-dir-file",
      protocol: "file:",
      searchParams: {
        // ...isMemFS,
        name: "my-app",
        store: "data",
        storekey: "@my-app-data@",
        urlGen: "fromEnv",
        version: "v0.19-file",
      },
      style: "path",
    });

    const dataStore = await db.ledger.crdt.blockstore.loader.attachedStores.local().active.car;
    expect(dataStore?.url().asObj()).toEqual({
      pathname: "./dist/fp-dir-file",
      protocol: "file:",
      searchParams: {
        // ...isMemFS,
        name: "my-app",
        store: "data",
        suffix: ".car",
        storekey: "@my-app-data@",
        urlGen: "fromEnv",
        version: "v0.19-file",
      },
      style: "path",
    });
    const metaStore = await db.ledger.crdt.blockstore.loader.attachedStores.local().active.meta;
    expect(metaStore?.url().asObj()).toEqual({
      pathname: "./dist/fp-dir-file",
      protocol: "file:",
      searchParams: {
        // ...isMemFS,
        name: "my-app",
        store: "meta",
        storekey: "@my-app-meta@",
        urlGen: "fromEnv",
        version: "v0.19-file",
      },
      style: "path",
    });
    const WALStore = await db.ledger.crdt.blockstore.loader.attachedStores.local().active.wal;
    expect(WALStore?.url().asObj()).toEqual({
      pathname: "./dist/fp-dir-file",
      protocol: "file:",
      searchParams: {
        // ...isMemFS,
        name: "my-app",
        store: "wal",
        storekey: "@my-app-wal@",
        urlGen: "fromEnv",
        version: "v0.19-file",
      },
      style: "path",
    });
    await db.close();
  });

  it("file path", async () => {
    let baseDir = "./dist/data".replace(/\?.*$/, "").replace(/^file:\/\//, "");
    baseDir = sthis.pathOps.join(baseDir, /* testCfg(sthis, "data").version, */ my_app());
    const base = BuildURI.from("./dist/data");
    // if (isMemFS.fs) {
    //   base.setParam("fs", isMemFS.fs);
    // }
    const sysfs = await rt.gw.file.sysFileSystemFactory(base.URI());
    await sysfs.rm(baseDir, { recursive: true }).catch(() => {
      /* */
    });

    const db = fireproof(my_app(), { storeUrls: { base } });
    // console.log(`>>>>>>>>>>>>>>>file-path`)
    await db.put({ name: "my-app" });
    expect(db.ledger.name).toBe(my_app());
    const carStore = await db.ledger.crdt.blockstore.loader.attachedStores.local().active.car;
    expect(carStore?.url().asObj()).toEqual({
      pathname: "./dist/data",
      protocol: "file:",
      searchParams: {
        // ...isMemFS,
        name: "my-app",
        store: "data",
        storekey: "@my-app-data@",
        suffix: ".car",
        version: "v0.19-file",
      },
      style: "path",
    });
    const fileStore = await db.ledger.crdt.blockstore.loader.attachedStores.local().active.file;
    expect(fileStore?.url().asObj()).toEqual({
      pathname: "./dist/data",
      protocol: "file:",
      searchParams: {
        // ...isMemFS,
        name: "my-app",
        store: "data",
        storekey: "@my-app-data@",
        version: "v0.19-file",
      },
      style: "path",
    });
    expect((await sysfs.stat(sthis.pathOps.join(baseDir, "data"))).isDirectory()).toBeTruthy();
    const metaStore = await db.ledger.crdt.blockstore.loader.attachedStores.local().active.meta;
    expect(metaStore?.url().asObj()).toEqual({
      pathname: "./dist/data",
      protocol: "file:",
      searchParams: {
        // ...isMemFS,
        name: "my-app",
        store: "meta",
        storekey: "@my-app-meta@",
        version: "v0.19-file",
      },
      style: "path",
    });
    expect((await sysfs.stat(sthis.pathOps.join(baseDir, "meta"))).isDirectory()).toBeTruthy();
    await db.close();
  });

  it("homedir default", async () => {
    const old = sthis.env.get("FP_STORAGE_URL");
    sthis.env.delete("FP_STORAGE_URL");
    // this switches file: protocol not memory:
    let baseDir = dataDir(sthis, my_app()).pathname;
    baseDir = sthis.pathOps.join(baseDir, my_app());

    const base = BuildURI.from(baseDir);
    // if (isMemFS.fs) {
    //   base.setParam("fs", isMemFS.fs);
    // }
    const sysfs = await rt.gw.file.sysFileSystemFactory(base.URI());
    await sysfs.rm(baseDir, { recursive: true }).catch(() => {
      /* */
    });

    expect(baseDir).toMatch(new RegExp(`/\\.fireproof/${rt.FILESTORE_VERSION.replace(/-file/, "")}/${my_app()}`));

    const db = fireproof(my_app());
    await db.put({ name: "my-app" });
    expect(db.ledger.name).toBe(my_app());
    const carStore = await db.ledger.crdt.blockstore.loader.attachedStores.local().active.car;

    expect(carStore?.url().asObj()).toEqual({
      pathname: `${sthis.env.get("HOME")}/.fireproof/v0.19`,
      protocol: "file:",
      style: "path",
      searchParams: {
        // ...isMemFS,
        suffix: ".car",
        runtime: runtimeFn().isDeno ? "deno" : "node",
        urlGen: "default",
        store: "data",
        name: my_app(),
        storekey: `@${my_app()}-data@`,
        version: rt.FILESTORE_VERSION,
      },
    });

    expect((await sysfs.stat(sthis.pathOps.join(baseDir, "data"))).isDirectory()).toBeTruthy();

    const fileStore = await db.ledger.crdt.blockstore.loader.attachedStores.local().active.file;
    expect(fileStore?.url().asObj()).toEqual({
      pathname: `${sthis.env.get("HOME")}/.fireproof/v0.19`,
      protocol: "file:",
      style: "path",
      searchParams: {
        // ...isMemFS,
        runtime: runtimeFn().isDeno ? "deno" : "node",
        urlGen: "default",
        store: "data",
        name: my_app(),
        storekey: `@${my_app()}-data@`,
        version: rt.FILESTORE_VERSION,
      },
    });
    const metaStore = await db.ledger.crdt.blockstore.loader.attachedStores.local().active.meta;
    expect(metaStore?.url().asObj()).toEqual({
      pathname: `${sthis.env.get("HOME")}/.fireproof/v0.19`,
      protocol: "file:",
      style: "path",
      searchParams: {
        // ...isMemFS,
        runtime: runtimeFn().isDeno ? "deno" : "node",
        urlGen: "default",
        store: "meta",
        name: my_app(),
        storekey: `@${my_app()}-meta@`,
        version: rt.FILESTORE_VERSION,
      },
    });

    expect((await sysfs.stat(sthis.pathOps.join(baseDir, "meta"))).isDirectory()).toBeTruthy();
    sthis.env.set("FP_STORAGE_URL", old);
    await db.close();
  });

  it("set by env", async () => {
    const old = sthis.env.get("FP_STORAGE_URL");
    // assert(!old, "FP_STORAGE_URL must set")
    const testUrl = BuildURI.from(old);
    // sthis.env.set("FP_STORAGE_URL", testUrl.toString());

    let baseDir = dataDir(sthis, my_app()).pathname;
    baseDir = sthis.pathOps.join(baseDir, /* testCfg(sthis, "data").version, */ my_app());

    const sysfs = await rt.gw.file.sysFileSystemFactory(testUrl.URI());
    await sysfs.rm(baseDir, { recursive: true }).catch(() => {
      /* */
    });

    const db = fireproof(my_app());
    await db.put({ name: "my-app" });
    expect(db.ledger.name).toBe(my_app());
    const carStore = await db.ledger.crdt.blockstore.loader.attachedStores.local().active.car;
    expect(carStore?.url().asObj()).toEqual({
      pathname: "./dist/fp-dir-file",
      protocol: "file:",
      style: "path",
      searchParams: {
        // ...isMemFS,
        urlGen: "fromEnv",
        store: "data",
        // runtime: "node",
        suffix: ".car",
        name: my_app(),
        storekey: `@${my_app()}-data@`,
        version: rt.FILESTORE_VERSION,
      },
    });

    expect((await sysfs.stat(sthis.pathOps.join(baseDir, "data"))).isDirectory()).toBeTruthy();
    const fileStore = await db.ledger.crdt.blockstore.loader.attachedStores.local().active.file;
    expect(fileStore?.url().asObj()).toEqual({
      pathname: `./dist/fp-dir-file`,
      protocol: "file:",
      style: "path",
      searchParams: {
        // ...isMemFS,
        urlGen: "fromEnv",
        store: "data",
        name: my_app(),
        storekey: `@${my_app()}-data@`,
        version: rt.FILESTORE_VERSION,
      },
    });

    const metaStore = await db.ledger.crdt.blockstore.loader.attachedStores.local().active.meta;
    expect(metaStore?.url().asObj()).toEqual({
      pathname: `./dist/fp-dir-file`,
      protocol: "file:",
      style: "path",
      searchParams: {
        // ...isMemFS,
        urlGen: "fromEnv",
        store: "meta",
        name: my_app(),
        storekey: `@${my_app()}-meta@`,
        version: rt.FILESTORE_VERSION,
      },
    });
    expect((await sysfs.stat(sthis.pathOps.join(baseDir, "meta"))).isDirectory()).toBeTruthy();
    await db.close();
    sthis.env.set("FP_STORAGE_URL", old);
  });
});

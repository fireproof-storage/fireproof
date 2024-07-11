import { fireproof, rt } from "@fireproof/core";
import { isNode } from "std-env";
import { SysContainer } from "../../src/runtime";

describe("fireproof/config", () => {
  let _my_app = "my-app";
  function my_app() {
    return _my_app;
  }
  beforeAll(async () => {
    await rt.SysContainer.start();
    if (isNode) {
      if (process.env.FP_STORAGE_URL) {
        let url: URL;
        try {
          url = new URL(process.env.FP_STORAGE_URL);
        } catch (e) {
          url = new URL(`file://${process.env.FP_STORAGE_URL}`);
        }
        _my_app = `my-app-${url.protocol.replace(/:$/, "")}`;
      }
    }
  });

  if (!isNode) {
    it("default", async () => {
      const db = fireproof(my_app());
      await db.put({ name: "my-app" });
      expect(db.name).toBe(my_app());
      const carStore = await db.blockstore.loader?.carStore();
      expect(carStore?.url.toString()).toMatch(new RegExp(`indexdb://fp\\?name=my-app&store=data&version=${rt.INDEXDB_VERSION}`));
      const fileStore = await db.blockstore.loader?.fileStore();
      expect(fileStore?.url.toString()).toMatch(new RegExp(`indexdb://fp\\?name=my-app&store=data&version=${rt.INDEXDB_VERSION}`));
      const metaStore = await db.blockstore.loader?.metaStore();
      expect(metaStore?.url.toString()).toMatch(new RegExp(`indexdb://fp\\?name=my-app&store=meta&version=${rt.INDEXDB_VERSION}`));
      await db.close();
    });
    return;
  }
  it("node default", async () => {
    const old = process.env.FP_STORAGE_URL;
    delete process.env.FP_STORAGE_URL;
    let baseDir = rt
      .dataDir(my_app())
      .replace(/\?.*$/, "")
      .replace(/^file:\/\//, "");
    baseDir = SysContainer.join(baseDir, rt.FILESTORE_VERSION, my_app());
    await SysContainer.rm(baseDir, { recursive: true }).catch(() => {
      /* */
    });

    expect(baseDir).toMatch(new RegExp(`/\\.fireproof/${rt.FILESTORE_VERSION}/${my_app()}`));

    const db = fireproof(my_app());
    await db.put({ name: "my-app" });
    expect(db.name).toBe(my_app());
    const carStore = await db.blockstore.loader?.carStore();

    expect(carStore?.url.toString()).toMatch(
      new RegExp(`file:.*\\/\\.fireproof\\?name=${my_app()}&store=data&version=${rt.FILESTORE_VERSION}`),
    );
    expect((await SysContainer.stat(SysContainer.join(baseDir, "data"))).isDirectory()).toBeTruthy();

    const fileStore = await db.blockstore.loader?.fileStore();
    expect(fileStore?.url.toString()).toMatch(
      new RegExp(`file:.*\\/\\.fireproof\\?name=${my_app()}&store=data&version=${rt.FILESTORE_VERSION}`),
    );
    const metaStore = await db.blockstore.loader?.metaStore();
    expect(metaStore?.url.toString()).toMatch(
      new RegExp(`file:.*\\/\\.fireproof\\?name=${my_app()}&store=meta&version=${rt.FILESTORE_VERSION}`),
    );
    expect((await SysContainer.stat(SysContainer.join(baseDir, "meta"))).isDirectory()).toBeTruthy();
    process.env.FP_STORAGE_URL = old;
    await db.close();
  });

  it("set by env", async () => {
    const old = process.env.FP_STORAGE_URL;
    process.env.FP_STORAGE_URL = "./dist/env";

    let baseDir = rt
      .dataDir(my_app())
      .replace(/\?.*$/, "")
      .replace(/^file:\/\//, "");
    baseDir = SysContainer.join(baseDir, rt.FILESTORE_VERSION, my_app());
    await SysContainer.rm(baseDir, { recursive: true }).catch(() => {
      /* */
    });

    const db = fireproof(my_app());
    await db.put({ name: "my-app" });
    expect(db.name).toBe(my_app());
    const carStore = await db.blockstore.loader?.carStore();
    expect(carStore?.url.toString()).toMatch(
      new RegExp(`file://\\./dist/env\\?name=${my_app()}&store=data&version=${rt.FILESTORE_VERSION}`),
    );
    expect((await SysContainer.stat(SysContainer.join(baseDir, "data"))).isDirectory()).toBeTruthy();
    const fileStore = await db.blockstore.loader?.fileStore();
    expect(fileStore?.url.toString()).toMatch(
      new RegExp(`file://\\./dist/env\\?name=${my_app()}&store=data&version=${rt.FILESTORE_VERSION}`),
    );
    const metaStore = await db.blockstore.loader?.metaStore();
    expect(metaStore?.url.toString()).toMatch(
      new RegExp(`file://\\./dist/env\\?name=${my_app()}&store=meta&version=${rt.FILESTORE_VERSION}`),
    );
    expect((await SysContainer.stat(SysContainer.join(baseDir, "meta"))).isDirectory()).toBeTruthy();
    await db.close();
    process.env.FP_STORAGE_URL = old;
  });

  it("file path", async () => {
    let baseDir = "./dist/data".replace(/\?.*$/, "").replace(/^file:\/\//, "");
    baseDir = SysContainer.join(baseDir, rt.FILESTORE_VERSION, my_app());
    await SysContainer.rm(baseDir, { recursive: true }).catch(() => {
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
    expect(carStore?.url.toString()).toMatch(
      new RegExp(`file://.\\/dist\\/data\\?name=${my_app()}&store=data&version=${rt.FILESTORE_VERSION}`),
    );
    const fileStore = await db.blockstore.loader?.fileStore();
    expect(fileStore?.url.toString()).toMatch(
      new RegExp(`file://.\\/dist\\/data\\?name=${my_app()}&store=data&version=${rt.FILESTORE_VERSION}`),
    );
    expect((await SysContainer.stat(SysContainer.join(baseDir, "data"))).isDirectory()).toBeTruthy();
    const metaStore = await db.blockstore.loader?.metaStore();
    expect(metaStore?.url.toString()).toMatch(
      new RegExp(`file://.\\/dist\\/data\\?name=${my_app()}&store=meta&version=${rt.FILESTORE_VERSION}`),
    );
    expect((await SysContainer.stat(SysContainer.join(baseDir, "meta"))).isDirectory()).toBeTruthy();
    await db.close();
  });

  it("sqlite path", async () => {
    let dbFile = "sqlite://./dist/sqlite".replace(/\?.*$/, "").replace(/^sqlite:\/\//, "");
    dbFile = SysContainer.join(dbFile, `${my_app()}.sqlite`);
    await SysContainer.rm(dbFile, { recursive: true }).catch(() => {
      /* */
    });

    const db = fireproof(my_app(), {
      store: {
        stores: {
          base: "sqlite://./dist/sqlite",
        },
      },
    });
    // console.log(`>>>>>>>>>>>>>>>file-path`)
    await db.put({ name: "my-app" });
    expect((await SysContainer.stat(dbFile)).isFile()).toBeTruthy();
    expect(db.name).toBe(my_app());
    const carStore = await db.blockstore.loader?.carStore();
    expect(carStore?.url.toString()).toMatch(
      new RegExp(`sqlite://./dist/sqlite\\?name=${my_app()}&store=data&version=${rt.SQLITE_VERSION}`),
    );
    const fileStore = await db.blockstore.loader?.fileStore();
    expect(fileStore?.url.toString()).toMatch(
      new RegExp(`sqlite://./dist/sqlite\\?name=${my_app()}&store=data&version=${rt.SQLITE_VERSION}`),
    );
    const metaStore = await db.blockstore.loader?.metaStore();
    expect(metaStore?.url.toString()).toMatch(
      new RegExp(`sqlite://./dist/sqlite\\?name=${my_app()}&store=meta&version=${rt.SQLITE_VERSION}`),
    );
    await db.close();
  });

  it("full config path", async () => {
    const db = fireproof(my_app(), {
      store: {
        stores: {
          base: "sqlite://./dist/sqlite",

          meta: "sqlite://./dist/sqlite/meta",
          data: "sqlite://./dist/sqlite/data",
          index: "sqlite://./dist/sqlite/index",
          remoteWAL: "sqlite://./dist/sqlite/wal",
        },
      },
    });
    // console.log(`>>>>>>>>>>>>>>>file-path`)
    await db.put({ name: "my-app" });
    expect(db.name).toBe(my_app());

    const carStore = await db.blockstore.loader?.carStore();
    expect(carStore?.url.toString()).toMatch(
      // sqlite://./dist/sqlite/data?store=data&version=v0.19-sqlite
      new RegExp(`sqlite://./dist/sqlite/data\\?store=data&version=${rt.SQLITE_VERSION}`),
    );

    const fileStore = await db.blockstore.loader?.fileStore();
    expect(fileStore?.url.toString()).toMatch(new RegExp(`sqlite://./dist/sqlite/data\\?store=data&version=${rt.SQLITE_VERSION}`));
    const metaStore = await db.blockstore.loader?.metaStore();
    expect(metaStore?.url.toString()).toMatch(new RegExp(`sqlite://./dist/sqlite/meta\\?store=meta&version=${rt.SQLITE_VERSION}`));
    await db.close();
  });
});

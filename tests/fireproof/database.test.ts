import { URI } from "@adviser/cement";
import { buildBlobFiles, FileWithCid, mockSuperThis } from "../helpers.js";
import {
  bs,
  DocResponse,
  DocFileMeta,
  DocWithId,
  DocFiles,
  toStoreURIRuntime,
  keyConfigOpts,
  ensureSuperThis,
  Database,
  fireproof,
  LedgerShell,
} from "@fireproof/core";

describe("basic Ledger", () => {
  let db: Database;
  const sthis = mockSuperThis();
  afterEach(async () => {
    await db.close();
    await db.destroy();
  });
  beforeEach(async () => {
    await sthis.start();
    db = fireproof(undefined as unknown as string, {
      logger: sthis.logger,
    });
  });
  it("should put", async () => {
    /** @type {Doc} */
    const doc = { _id: "hello", value: "world" };
    const ok = await db.put(doc);
    expect(ok.id).toBe("hello");
  });
  it("get missing should throw", async () => {
    const e = await db.get("missing").catch((e) => e);
    expect(e.message).toMatch(/Not found/);
  });
  it("del missing should result in deleted state", async () => {
    await db.del("missing");

    const e = await db.get("missing").catch((e) => e);
    expect(e.message).toMatch(/Not found/);
  });
  it("has no changes", async () => {
    const { rows } = await db.changes([]);
    expect(rows.length).toBe(0);
  });
});

describe("basic Ledger with record", function () {
  interface Doc {
    readonly value: string;
  }
  let db: Database;
  const sthis = ensureSuperThis();
  afterEach(async () => {
    await db.close();
    await db.destroy();
  });
  beforeEach(async () => {
    await sthis.start();
    db = fireproof("factory-name");
    const ok = await db.put<Doc>({ _id: "hello", value: "world" });
    expect(ok.id).toBe("hello");
  });
  it("should get", async () => {
    const doc = await db.get<Doc>("hello");
    expect(doc).toBeTruthy();
    expect(doc._id).toBe("hello");
    expect(doc.value).toBe("world");
  });
  it("should update", async () => {
    const ok = await db.put({ _id: "hello", value: "universe" });
    expect(ok.id).toBe("hello");
    const doc = await db.get<Doc>("hello");
    expect(doc).toBeTruthy();
    expect(doc._id).toBe("hello");
    expect(doc.value).toBe("universe");
  });
  it("should del last record", async () => {
    const ok = await db.del("hello");
    expect(ok.id).toBe("hello");

    const e = await db.get("hello").catch((e) => e);
    expect(e.message).toMatch(/Not found/);
  });
  it("has changes", async () => {
    const { rows } = await db.changes([]);
    expect(rows.length).toBe(1);
    expect(rows[0].key).toBe("hello");
    expect(rows[0].value._id).toBe("hello");
  });
  it("is not persisted", async () => {
    const db2 = fireproof("factory-name");
    const { rows } = await db2.changes([]);
    expect(rows.length).toBe(1);
    // assert((db.ledger.ref === db2.ledger.ref, "should be the same ledger");
    expect((db.ledger as LedgerShell).ref).toBe((db2.ledger as LedgerShell).ref);
    const doc = await db2.get<Doc>("hello").catch((e) => e);
    expect(doc.value).toBe("world");
    await db2.close();
  });
});

describe("named Ledger with record", function () {
  interface Doc {
    readonly value: string;
  }
  let db: Database;
  const sthis = ensureSuperThis();
  afterEach(async () => {
    await db.close();
    await db.destroy();
  });
  beforeEach(async () => {
    await sthis.start();
    db = fireproof("test-db-name");
    /** @type {Doc} */
    const doc = { _id: "hello", value: "world" };
    const ok = await db.put(doc);
    expect(ok.id).toBe("hello");
  });
  it("should get", async () => {
    const doc = await db.get<Doc>("hello");
    expect(doc).toBeTruthy();
    expect(doc._id).toBe("hello");
    expect(doc.value).toBe("world");
  });
  it("should update", async () => {
    const ok = await db.put({ _id: "hello", value: "universe" });
    expect(ok.id).toBe("hello");
    const doc = await db.get<Doc>("hello");
    expect(doc).toBeTruthy();
    expect(doc._id).toBe("hello");
    expect(doc.value).toBe("universe");
  });
<<<<<<< HEAD
<<<<<<< HEAD
  it("should update with null value", async function () {
    const ok = await db.put({ _id: "hello", value: null });
    expect(ok.id).toBe("hello");
    const doc = await db.get<Doc>("hello");
    expect(doc).toBeTruthy();
    expect(doc._id).toBe("hello");
    expect(doc.value).toBeNull();
    expect(Object.keys(doc).includes("value")).toBeTruthy();
  });
  it("should update with undefined value", async function () {
    const ok = await db.put({ _id: "hello", value: undefined });
    expect(ok.id).toBe("hello");
    const doc = await db.get<Doc>("hello");
    expect(doc).toBeTruthy();
    expect(doc._id).toBe("hello");

    // expect 'value' not to be in keys
    expect(Object.keys(doc).includes("value")).toBeFalsy();
  });
  it("should update with NaN value", async function () {
    const ok = await db.put({ _id: "hello", value: NaN });
    expect(ok.id).toBe("hello");
    const doc = await db.get<Doc>("hello");
    expect(doc).toBeTruthy();
    expect(doc._id).toBe("hello");

    // expect 'value' not to be in keys
    expect(Object.keys(doc).includes("value")).toBeFalsy();
  });
  it("should not update with Infinity value", async function () {
    const ok = await db.put({ _id: "hello", value: Infinity }).catch((e) => e);
    expect(ok.message).toMatch(/IPLD/);
  });
  it("should not update with undefined array value", async function () {
    const ok = await db.put({ _id: "hello", value: [undefined] }).catch((e) => e);
    expect(ok.message).toMatch(/IPLD/);
  });
  it("should not update with NaN array value", async function () {
    const ok = await db.put({ _id: "hello", value: [NaN] }).catch((e) => e);
    expect(ok.message).toMatch(/IPLD/);
  });
  it("should del last record", async function () {
  it("should del last record", async () =>{
    const ok = await db.del("hello");
    expect(ok.id).toBe("hello");

    const e = await db.get("hello").catch((e) => e);
    expect(e.message).toMatch(/Not found/);
  });
  it("has changes", async () => {
    const { rows } = await db.changes([]);
    expect(rows.length).toBe(1);
    expect(rows[0].key).toBe("hello");
    expect(rows[0].value._id).toBe("hello");
  });
  it("should have a key", async () => {
    const { rows } = await db.changes([]);
    expect(rows.length).toBe(1);
    const blocks = db.ledger.crdt.blockstore as bs.EncryptedBlockstore;
    const loader = blocks.loader;
    expect(loader).toBeTruthy();
    await loader.ready();

    // expect(loader.key?.length).toBe(64);
    // expect(loader.keyId?.length).toBe(64);
    // expect(loader.key).not.toBe(loader.keyId);
  });
  it("should work right with a sequence of changes", async () => {
    const numDocs = 10;
    for (let i = 0; i < numDocs; i++) {
      const doc = { _id: `id-${i}`, hello: "world" };
      const ok = await db.put(doc);
      expect(ok.id).toBe(`id-${i}`);
    }
    const { rows } = await db.changes([]);
    expect(rows.length).toBe(numDocs + 1);

    const ok6 = await db.put({ _id: `id-${6}`, hello: "block" });
    expect(ok6.id).toBe(`id-${6}`);

    for (let i = 0; i < numDocs; i++) {
      const id = `id-${i}`;
      const doc = await db.get<{ hello: string }>(id);
      expect(doc).toBeTruthy();
      expect(doc._id).toBe(id);
      expect(doc.hello.length).toBe(5);
    }

    const { rows: rows2 } = await db.changes([]);
    expect(rows2.length).toBe(numDocs + 1);

    const ok7 = await db.del(`id-${7}`);
    expect(ok7.id).toBe(`id-${7}`);

    const { rows: rows3 } = await db.changes([]);
    expect(rows3.length).toBe(numDocs + 1);
    expect(rows3[numDocs].key).toBe(`id-${7}`);
    expect(rows3[numDocs].value._deleted).toBe(true);

    // test limit
    const { rows: rows4 } = await db.changes([], { limit: 5 });
    expect(rows4.length).toBe(5);
  });

  it("should work right after compaction", async () => {
    const numDocs = 10;
    for (let i = 0; i < numDocs; i++) {
      const doc = { _id: `id-${i}`, hello: "world" };
      const ok = await db.put(doc);
      expect(ok.id).toBe(`id-${i}`);
    }
    const { rows } = await db.changes([]);
    expect(rows.length).toBe(numDocs + 1);

    await db.compact();

    const { rows: rows3 } = await db.changes([], { dirty: true });
    expect(rows3.length).toBe(numDocs + 1);

    const { rows: rows4 } = await db.changes([], { dirty: false });
    expect(rows4.length).toBe(numDocs + 1);
  });
});

// describe('basic Ledger parallel writes / public', function () {
//   /** @type {Ledger} */
//   let db
//   const writes = []
//   beforeEach(async () =>{
//     await resetDirectory(dataDir, 'test-parallel-writes')
//     db = new Ledger('test-parallel-writes', { public: true })
//     /** @type {Doc} */
//     for (let i = 0; i < 10; i++) {
//       const doc = { _id: `id-${i}`, hello: 'world' }
//       writes.push(db.put(doc))
//     }
//     await Promise.all(writes)
//   })

describe("basic Ledger parallel writes / public ordered", () => {
  let db: Database;
  const writes: Promise<DocResponse>[] = [];
  const sthis = mockSuperThis();
  afterEach(async () => {
    await db.close();
    await db.destroy();
  });
  beforeEach(async () => {
    await sthis.start();
    db = fireproof("test-parallel-writes-ordered", { writeQueue: { chunkSize: 1 } });
    for (let i = 0; i < 10; i++) {
      const doc = { _id: `id-${i}`, hello: "world" };
      writes.push(db.put(doc));
    }
    await Promise.all(writes);
  });

  it("should have one head", () => {
    const crdt = db.ledger.crdt;
    expect(crdt.clock.head.length).toBe(1);
  });

  it("has changes ordered", async () => {
    const { rows, clock } = await db.changes([]);
    expect(clock[0]).toBe(db.ledger.crdt.clock.head[0]);
    expect(rows.length).toBe(10);
    for (let i = 0; i < 10; i++) {
      expect(rows[i].key).toBe("id-" + i);
      expect(rows[i].clock).toBeTruthy();
    }
  });
});

describe("basic Ledger parallel writes / public", () => {
  let db: Database;
  const writes: Promise<DocResponse>[] = [];
  const sthis = ensureSuperThis();
  afterEach(async () => {
    await db.close();
    await db.destroy();
  });
  beforeEach(async () => {
    await sthis.start();
    db = fireproof("test-parallel-writes", { writeQueue: { chunkSize: 32 } });
    for (let i = 0; i < 10; i++) {
      const doc = { _id: `id-${i}`, hello: "world" };
      writes.push(db.put(doc));
    }
    await Promise.all(writes);
  });
  it("should resolve to one head", async () => {
    const crdt = db.ledger.crdt;
    expect(crdt.clock.head.length).toBe(9);
    await db.put({ _id: "id-10", hello: "world" });
    expect(crdt.clock.head.length).toBe(1);
  });
  it("should write all", async () => {
    for (let i = 0; i < 10; i++) {
      const id = `id-${i}`;
      const doc = await db.get<{ hello: string }>(id);
      expect(doc).toBeTruthy();
      expect(doc._id).toBe(id);
      expect(doc.hello).toBe("world");
    }
  });
  it("should del all", async () => {
    for (let i = 0; i < 10; i++) {
      const id = `id-${i}`;
      const ok = await db.del(id);
      expect(ok.id).toBe(id);

      const e = await db.get(id).catch((e) => e);
      expect(e.message).toMatch(/Not found/);
    }
  });
  it("should delete all in parallel", async () => {
    const deletes: Promise<DocResponse>[] = [];
    for (let i = 0; i < 10; i++) {
      const id = `id-${i}`;
      deletes.push(db.del(id));
    }
    await Promise.all(deletes);
    for (let i = 0; i < 10; i++) {
      const id = `id-${i}`;
      const e = await db.get(id).catch((e) => e);
      expect(e.message).toMatch(/Not found/);
    }
  });
  it("has changes not ordered", async () => {
    const { rows, clock } = await db.changes([]);
    expect(clock[0]).toBe(db.ledger.crdt.clock.head[0]);
    expect(rows.length).toBe(10);
    rows.sort((a, b) => a.key.localeCompare(b.key));
    // console.log(rows);
    for (let i = 0; i < 10; i++) {
      expect(rows[i].key).toBe("id-" + i);
      expect(rows[i].clock).toBeTruthy();
    }
  });
  it("should not have a key", async () => {
    const { rows } = await db.changes([]);
    expect(rows.length).toBe(10);
    // expect(db.opts.public).toBeTruthy();
    // expect(db._crdt.opts.public).toBeTruthy();
    const blocks = db.ledger.crdt.blockstore as bs.EncryptedBlockstore;
    const loader = blocks.loader;
    expect(loader).toBeTruthy();
    await loader.ready();
    // expect(loader.key).toBeUndefined();
    // expect(loader.keyId).toBeUndefined();
  });
});

describe("basic Ledger with subscription", function () {
  let db: Database;
  let didRun: number;
  let unsubscribe: () => void;
  let lastDoc: DocWithId<NonNullable<unknown>>;
  let waitForSub: Promise<void>;
  const sthis = ensureSuperThis();
  afterEach(async () => {
    await db.close();
    await db.destroy();
  });
  beforeEach(async () => {
    await sthis.start();
    db = fireproof("factory-name");
    didRun = 0;
    waitForSub = new Promise((resolve) => {
      unsubscribe = db.subscribe((docs) => {
        lastDoc = docs[0];
        // lastDoc = {_id: "ok"};
        didRun++;
        resolve();
      }, true);
    });
  });
  it("should run on put", async () => {
    const all = await db.allDocs();
    expect(all.rows.length).toBe(0);
    const doc = { _id: "hello", message: "world" };
    expect(didRun).toBe(0);
    const ok = await db.put(doc);
    await waitForSub;
    expect(didRun).toBeTruthy();
    expect(lastDoc).toBeTruthy();
    expect(lastDoc._id).toBe("hello");
    expect(ok.id).toBe("hello");
    expect(didRun).toBe(1);
  });
  it("should unsubscribe", async () => {
    unsubscribe();
    const doc = { _id: "hello", message: "again" };
    const ok = await db.put(doc);
    expect(ok.id).toBe("hello");
    expect(didRun).toBe(0);
  });
});

describe("basic Ledger with no update subscription", function () {
  let db: Database;
  let didRun: number;
  let unsubscribe: () => void;
  // const sthis = ensureSuperThis();
  afterEach(async () => {
    await db.close();
    await db.destroy();
  });
  beforeEach(async () => {
    db = fireproof("factory-name");
    didRun = 0;
    unsubscribe = db.subscribe(() => {
      didRun++;
    });
  });
  it("xshould run on put", async function () {
    const all = await db.allDocs();
    expect(all.rows.length).toBe(0);
    /** @type {Doc} */
    const doc = { _id: "hello", message: "world" };
    expect(didRun).toBe(0);
    const ok = await db.put(doc);
    expect(ok.id).toBe("hello");
    expect(didRun).toBe(1);
  }, 10000);
  it("should unsubscribe", async () => {
    unsubscribe();
    const doc = { _id: "hello", message: "again" };
    const ok = await db.put(doc);
    expect(ok.id).toBe("hello");
    expect(didRun).toBe(0);
  });
});

describe("ledger with files input", () => {
  let db: Database;
  let imagefiles: FileWithCid[] = [];
  let result: DocResponse;
  const sthis = ensureSuperThis();

  afterEach(async () => {
    await db.close();
    await db.destroy();
  });
  beforeEach(async () => {
    await sthis.start();
    imagefiles = await buildBlobFiles();
    db = fireproof("fireproof-with-images");
    const doc = {
      _id: "images-main",
      type: "files",
      _files: {
        one: imagefiles[0].file,
        two: imagefiles[1].file,
      },
    };
    result = await db.put(doc);
  });

  it("Should upload images", async () => {
    expect(result.id).toBe("images-main");
  });

  it("Should fetch the images", async () => {
    const doc = await db.get(result.id);
    const files = doc._files as DocFiles;
    expect(files).toBeTruthy();
    const keys = Object.keys(files);
    let fileMeta = files[keys[0]] as DocFileMeta;
    expect(fileMeta).toBeTruthy();
    expect(imagefiles[0].file.type).toBeTruthy();
    expect(fileMeta.type).toBeTruthy();
    expect(fileMeta.type).toBe(imagefiles[0].file.type);
    expect(fileMeta.size).toBe(imagefiles[0].file.size);
    expect(fileMeta.cid.toString()).toBe(imagefiles[0].cid);
    expect(typeof fileMeta.file).toBe("function");
    let file = (await fileMeta.file?.()) as File;

    expect(file.type).toBe(imagefiles[0].file.type);
    expect(file.size).toBe(imagefiles[0].file.size);
    // expect(file.name).toBe('image.jpg') // see https://github.com/fireproof-storage/fireproof/issues/70

    fileMeta = files[keys[1]] as DocFileMeta;
    expect(fileMeta.type).toBe(imagefiles[1].file.type);
    expect(fileMeta.size).toBe(imagefiles[1].file.size);
    expect(fileMeta.cid.toString()).toBe(imagefiles[1].cid);
    expect(typeof fileMeta.file).toBe("function");
    file = (await fileMeta.file?.()) as File;

    expect(file.type).toBe(imagefiles[1].file.type);
    expect(file.size).toBe(imagefiles[1].file.size);
    // expect(file.name).toBe('fireproof.png') // see https://github.com/fireproof-storage/fireproof/issues/70
  });

  it("should update the file document data without changing the files", async () => {
    interface Doc {
      type: string;
    }
    const doc = await db.get<Doc>(result.id);
    let files = doc._files || {};
    let keys = Object.keys(files);
    let fileMeta = files[keys[0]] as DocFileMeta;
    expect(fileMeta.type).toBe(imagefiles[0].file.type);
    expect(fileMeta.size).toBe(imagefiles[0].file.size);
    expect(fileMeta.cid.toString()).toBe(imagefiles[0].cid);
    expect(typeof fileMeta.file).toBe("function");
    let file = (await fileMeta.file?.()) as File;

    expect(file.type).toBe(imagefiles[0].file.type);
    expect(file.size).toBe(imagefiles[0].file.size);

    doc.type = "images";
    const r2 = await db.put(doc);
    expect(r2.id).toBe("images-main");
    const readDoc = await db.get<Doc>(r2.id);
    expect(readDoc.type).toBe("images");
    files = readDoc._files || {};
    keys = Object.keys(files);
    fileMeta = files[keys[0]] as DocFileMeta;
    expect(fileMeta.type).toBe(imagefiles[0].file.type);
    expect(fileMeta.size).toBe(imagefiles[0].file.size);
    expect(fileMeta.cid.toString()).toBe(imagefiles[0].cid);
    expect(typeof fileMeta.file).toBe("function");
    file = (await fileMeta.file?.()) as File;

    expect(file.type).toBe(imagefiles[0].file.type);
    expect(file.size).toBe(imagefiles[0].file.size);
  }, 1000000);
});

describe("StoreURIRuntime", () => {
  const sthis = mockSuperThis();
  let safeEnv: string | undefined;
  let unreg: () => void;
  beforeEach(async () => {
    await sthis.start();
    safeEnv = sthis.env.get("FP_STORAGE_URL");
    sthis.env.set("FP_STORAGE_URL", "my://bla/storage");
    // console.log(">>>>>>>>>>", bs, bs.registerStoreProtocol)
    unreg = bs.registerStoreProtocol({
      protocol: "murks",
      isDefault: true,
      defaultURI: function (): URI {
        return URI.from("murks://fp");
      },
      gateway: function (): Promise<bs.Gateway> {
        throw new Error("Function not implemented.");
      },
    });
  });
  afterEach(() => {
    sthis.env.set("FP_STORAGE_URL", safeEnv);
    unreg();
  });
  it("default toStoreURIRuntime", () => {
    expect(JSON.parse(JSON.stringify(toStoreURIRuntime(sthis, "test")))).toEqual({
      data: {
        car: "my://bla/storage?name=test&store=car&storekey=%40test-data%40&suffix=.car&urlGen=fromEnv",
        file: "my://bla/storage?name=test&store=file&storekey=%40test-data%40&urlGen=fromEnv",
        meta: "my://bla/storage?name=test&store=meta&storekey=%40test-meta%40&urlGen=fromEnv",
        wal: "my://bla/storage?name=test&store=wal&storekey=%40test-wal%40&urlGen=fromEnv",
      },
      idx: {
        car: "my://bla/storage?index=idx&name=test&store=car&storekey=%40test-data-idx%40&suffix=.car&urlGen=fromEnv",
        file: "my://bla/storage?index=idx&name=test&store=file&storekey=%40test-data-idx%40&urlGen=fromEnv",
        meta: "my://bla/storage?index=idx&name=test&store=meta&storekey=%40test-meta-idx%40&urlGen=fromEnv",
        wal: "my://bla/storage?index=idx&name=test&store=wal&storekey=%40test-wal-idx%40&urlGen=fromEnv",
      },
    });
    // keyConfigOpts(sthis: SuperThis, name: string, opts?: ConfigOpts): string {
  });
  it("no name toStoreURIRuntime(not more)", () => {
    expect(JSON.parse(JSON.stringify(toStoreURIRuntime(sthis, "gogo")))).toEqual({
      data: {
        car: "my://bla/storage?name=gogo&store=car&storekey=%40gogo-data%40&suffix=.car&urlGen=fromEnv",
        file: "my://bla/storage?name=gogo&store=file&storekey=%40gogo-data%40&urlGen=fromEnv",
        meta: "my://bla/storage?name=gogo&store=meta&storekey=%40gogo-meta%40&urlGen=fromEnv",
        wal: "my://bla/storage?name=gogo&store=wal&storekey=%40gogo-wal%40&urlGen=fromEnv",
      },
      idx: {
        car: "my://bla/storage?index=idx&name=gogo&store=car&storekey=%40gogo-data-idx%40&suffix=.car&urlGen=fromEnv",
        file: "my://bla/storage?index=idx&name=gogo&store=file&storekey=%40gogo-data-idx%40&urlGen=fromEnv",
        meta: "my://bla/storage?index=idx&name=gogo&store=meta&storekey=%40gogo-meta-idx%40&urlGen=fromEnv",
        wal: "my://bla/storage?index=idx&name=gogo&store=wal&storekey=%40gogo-wal-idx%40&urlGen=fromEnv",
      },
    });
  });

  it("set toStoreURIRuntime", () => {
    expect(
      JSON.parse(
        JSON.stringify(
          toStoreURIRuntime(sthis, "xxx", {
            base: "my://storage-base",
            data: {
              car: "my://storage-data?name=yyy",
              meta: "my://storage-meta",
            },
            idx: {
              car: "my://storage-idx-data?name=yyy&index=bla",
              meta: "my://storage-idx-meta",
            },
          }),
        ),
      ),
    ).toEqual({
      data: {
        car: "my://storage-data?name=yyy&store=car&storekey=%40yyy-data%40&suffix=.car",
        file: "my://storage-data?name=yyy&store=file&storekey=%40yyy-data%40",
        meta: "my://storage-meta?name=xxx&store=meta&storekey=%40xxx-meta%40",
        wal: "my://storage-base?name=xxx&store=wal&storekey=%40xxx-wal%40",
      },
      idx: {
        car: "my://storage-idx-data?index=bla&name=yyy&store=car&storekey=%40yyy-data-idx%40&suffix=.car",
        file: "my://storage-idx-data?index=bla&name=yyy&store=file&storekey=%40yyy-data-idx%40",
        meta: "my://storage-idx-meta?index=idx&name=xxx&store=meta&storekey=%40xxx-meta-idx%40",
        wal: "my://storage-base?index=idx&name=xxx&store=wal&storekey=%40xxx-wal-idx%40",
      },
    });
  });

  it("default-reg toStoreURIRuntime", () => {
    sthis.env.delete("FP_STORAGE_URL");
    expect(JSON.parse(JSON.stringify(toStoreURIRuntime(sthis, "maxi")))).toEqual({
      data: {
        car: "murks://fp?name=maxi&store=car&storekey=%40maxi-data%40&suffix=.car&urlGen=default",
        file: "murks://fp?name=maxi&store=file&storekey=%40maxi-data%40&urlGen=default",
        meta: "murks://fp?name=maxi&store=meta&storekey=%40maxi-meta%40&urlGen=default",
        wal: "murks://fp?name=maxi&store=wal&storekey=%40maxi-wal%40&urlGen=default",
      },
      idx: {
        car: "murks://fp?index=idx&name=maxi&store=car&storekey=%40maxi-data-idx%40&suffix=.car&urlGen=default",
        file: "murks://fp?index=idx&name=maxi&store=file&storekey=%40maxi-data-idx%40&urlGen=default",
        meta: "murks://fp?index=idx&name=maxi&store=meta&storekey=%40maxi-meta-idx%40&urlGen=default",
        wal: "murks://fp?index=idx&name=maxi&store=wal&storekey=%40maxi-wal-idx%40&urlGen=default",
      },
    });
  });

  it("keyConfigOpts", () => {
    expect(JSON.parse(keyConfigOpts(sthis, "test"))).toEqual([
      {
        name: "test",
      },
      {
        stores: [
          {
            data: {
              car: "my://bla/storage?name=test&store=car&storekey=%40test-data%40&suffix=.car&urlGen=fromEnv",
              file: "my://bla/storage?name=test&store=file&storekey=%40test-data%40&urlGen=fromEnv",
              meta: "my://bla/storage?name=test&store=meta&storekey=%40test-meta%40&urlGen=fromEnv",
              wal: "my://bla/storage?name=test&store=wal&storekey=%40test-wal%40&urlGen=fromEnv",
            },
          },
          {
            idx: {
              car: "my://bla/storage?index=idx&name=test&store=car&storekey=%40test-data-idx%40&suffix=.car&urlGen=fromEnv",
              file: "my://bla/storage?index=idx&name=test&store=file&storekey=%40test-data-idx%40&urlGen=fromEnv",
              meta: "my://bla/storage?index=idx&name=test&store=meta&storekey=%40test-meta-idx%40&urlGen=fromEnv",
              wal: "my://bla/storage?index=idx&name=test&store=wal&storekey=%40test-wal-idx%40&urlGen=fromEnv",
            },
          },
        ],
      },
    ]);
  });

  it("check file protocol defaultURI", () => {
    const gw = bs.defaultGatewayFactoryItem();
    expect(gw.defaultURI(sthis).toString()).toBe(
      "murks://fp",
      // `file://${sthis.env.get("HOME")}/.fireproof/${FILESTORE_VERSION.replace(/-.*$/, "")}`,
    );
  });
});

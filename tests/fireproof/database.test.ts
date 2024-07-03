import { assert, equals, notEquals, matches, buildBlobFiles, FileWithCid } from "../helpers.js";
import { Database, DbResponse, DocFileMeta, DocWithId } from "@fireproof/core";
import { SysContainer } from "@fireproof/core/runtime";
import { EncryptedBlockstore } from "@fireproof/core/storage-engine";

describe("basic Database", () => {
  let db: Database;
  afterEach(async () => {
    await db.close();
    await db.destroy();
  })
  beforeEach(async () => {
    await SysContainer.start();
    db = new Database()
  });
  it("should put", async () => {
    /** @type {Doc} */
    const doc = { _id: "hello", value: "world" };
    const ok = await db.put(doc);
    equals(ok.id, "hello");
  });
  it("get missing should throw", async () => {

    const e = await db.get("missing").catch((e) => e);
    matches(e.message, /Not found/);
  });
  it("del missing should result in deleted state", async () => {
    await db.del("missing");

    const e = await db.get("missing").catch((e) => e);
    matches(e.message, /Not found/);
  });
  it("has no changes", async () => {
    const { rows } = await db.changes([]);
    equals(rows.length, 0);
  });
});

describe("basic Database with record", function () {
  interface Doc { readonly value: string }
  let db: Database;
  afterEach(async () => {
    await db.close();
    await db.destroy();
  })
  beforeEach(async function () {
    await SysContainer.start();
    db = new Database();
    const ok = await db.put<Doc>({ _id: "hello", value: "world" });
    equals(ok.id, "hello");
  });
  it("should get", async function () {
    const doc = await db.get<Doc>("hello");
    assert(doc);
    equals(doc._id, "hello");
    equals(doc.value, "world");
  });
  it("should update", async function () {
    const ok = await db.put({ _id: "hello", value: "universe" });
    equals(ok.id, "hello");
    const doc = await db.get<Doc>("hello");
    assert(doc);
    equals(doc._id, "hello");
    equals(doc.value, "universe");
  });
  it("should del last record", async function () {
    const ok = await db.del("hello");
    equals(ok.id, "hello");

    const e = await db.get("hello").catch((e) => e);
    matches(e.message, /Not found/);
  });
  it("has changes", async function () {
    const { rows } = await db.changes([]);
    equals(rows.length, 1);
    equals(rows[0].key, "hello");
    equals(rows[0].value._id, "hello");
  });
  it("is not persisted", async function () {
    const db2 = new Database();
    const { rows } = await db2.changes([]);
    equals(rows.length, 0);
    const doc = await db2.get("hello").catch((e) => e);
    assert(doc.message);
    await db2.close();
    await db2.destroy();
  });
});

describe("named Database with record", function () {
  interface Doc { readonly value: string }
  let db: Database;
  afterEach(async () => {
    await db.close();
    await db.destroy();
  })
  beforeEach(async function () {
    await SysContainer.start();
    db = new Database("test-db-name");
    /** @type {Doc} */
    const doc = { _id: "hello", value: "world" };
    const ok = await db.put(doc);
    equals(ok.id, "hello");
  });
  it("should get", async function () {
    const doc = await db.get<Doc>("hello");
    assert(doc);
    equals(doc._id, "hello");
    equals(doc.value, "world");
  });
  it("should update", async function () {
    const ok = await db.put({ _id: "hello", value: "universe" });
    equals(ok.id, "hello");
    const doc = await db.get<Doc>("hello");
    assert(doc);
    equals(doc._id, "hello");
    equals(doc.value, "universe");
  });
  it("should del last record", async function () {
    const ok = await db.del("hello");
    equals(ok.id, "hello");

    const e = await db.get("hello").catch((e) => e);
    matches(e.message, /Not found/);
  });
  it("has changes", async function () {
    const { rows } = await db.changes([]);
    equals(rows.length, 1);
    equals(rows[0].key, "hello");
    equals(rows[0].value._id, "hello");
  });
  it("should have a key", async function () {
    const { rows } = await db.changes([]);
    equals(rows.length, 1);
    const blocks = db._crdt.blockstore as EncryptedBlockstore
    const loader = blocks.loader;
    assert(loader)
    await loader.ready();
    equals(loader.key?.length, 64);
    equals(loader.keyId?.length, 64);
    notEquals(loader.key, loader.keyId);
  });
  it("should work right with a sequence of changes", async function () {
    const numDocs = 10;
    for (let i = 0; i < numDocs; i++) {
      const doc = { _id: `id-${i}`, hello: "world" };
      const ok = await db.put(doc);
      equals(ok.id, `id-${i}`);
    }
    const { rows } = await db.changes([]);
    equals(rows.length, numDocs + 1);

    const ok6 = await db.put({ _id: `id-${6}`, hello: "block" });
    equals(ok6.id, `id-${6}`);

    for (let i = 0; i < numDocs; i++) {
      const id = `id-${i}`;
      const doc = await db.get<{ hello: string }>(id);
      assert(doc);
      equals(doc._id, id);
      equals(doc.hello.length, 5);
    }

    const { rows: rows2 } = await db.changes([]);
    equals(rows2.length, numDocs + 1);

    const ok7 = await db.del(`id-${7}`);
    equals(ok7.id, `id-${7}`);

    const { rows: rows3 } = await db.changes([]);
    equals(rows3.length, numDocs + 1);
    equals(rows3[numDocs].key, `id-${7}`);
    equals(rows3[numDocs].value._deleted, true);

    // test limit
    const { rows: rows4 } = await db.changes([], { limit: 5 });
    equals(rows4.length, 5);
  });

  it("should work right after compaction", async function () {
    const numDocs = 10;
    for (let i = 0; i < numDocs; i++) {
      const doc = { _id: `id-${i}`, hello: "world" };
      const ok = await db.put(doc);
      equals(ok.id, `id-${i}`);
    }
    const { rows } = await db.changes([]);
    equals(rows.length, numDocs + 1);

    await db.compact();

    const { rows: rows3 } = await db.changes([], { dirty: true });
    equals(rows3.length, numDocs + 1);

    const { rows: rows4 } = await db.changes([], { dirty: false });
    equals(rows4.length, numDocs + 1);
  });
});

// describe('basic Database parallel writes / public', function () {
//   /** @type {Database} */
//   let db
//   const writes = []
//   beforeEach(async function () {
//     await resetDirectory(dataDir, 'test-parallel-writes')
//     db = new Database('test-parallel-writes', { public: true })
//     /** @type {Doc} */
//     for (let i = 0; i < 10; i++) {
//       const doc = { _id: `id-${i}`, hello: 'world' }
//       writes.push(db.put(doc))
//     }
//     await Promise.all(writes)
//   })

describe("basic Database parallel writes / public", function () {
  let db: Database;
  const writes: Promise<DbResponse>[] = [];
  afterEach(async () => {
    await db.close();
    await db.destroy();
  })
  beforeEach(async function () {
    await SysContainer.start();
    db = new Database("test-parallel-writes", { public: true });
    for (let i = 0; i < 10; i++) {
      const doc = { _id: `id-${i}`, hello: "world" };
      writes.push(db.put(doc));
    }
    await Promise.all(writes);
  });
  it("should have one head", function () {
    const crdt = db._crdt;
    equals(crdt.clock.head.length, 1);
  });
  it("should write all", async function () {
    for (let i = 0; i < 10; i++) {
      const id = `id-${i}`;
      const doc = await db.get<{ hello: string }>(id);
      assert(doc);
      equals(doc._id, id);
      equals(doc.hello, "world");
    }
  });
  it("should del all", async function () {
    for (let i = 0; i < 10; i++) {
      const id = `id-${i}`;
      const ok = await db.del(id);
      equals(ok.id, id);

      const e = await db.get(id).catch((e) => e);
      matches(e.message, /Not found/);
    }
  });
  it("should delete all in parallel", async function () {
    const deletes: Promise<DbResponse>[] = [];
    for (let i = 0; i < 10; i++) {
      const id = `id-${i}`;
      deletes.push(db.del(id));
    }
    await Promise.all(deletes);
    for (let i = 0; i < 10; i++) {
      const id = `id-${i}`;
      const e = await db.get(id).catch((e) => e);
      matches(e.message, /Not found/);
    }
  });
  it("has changes", async function () {
    const { rows, clock } = await db.changes([]);
    equals(clock[0], db._crdt.clock.head[0]);
    equals(rows.length, 10);
    // rows.sort((a, b) => a.key.localeCompare(b.key));
    for (let i = 0; i < 10; i++) {
      equals(rows[i].key, "id-" + i);
      assert(rows[i].clock, "The clock head is missing");
    }
  });
  it("should not have a key", async function () {
    const { rows } = await db.changes([]);
    equals(rows.length, 10);
    assert(db.opts.public);
    assert(db._crdt.opts.public);
    const blocks = db._crdt.blockstore as EncryptedBlockstore
    const loader = blocks.loader;
    assert(loader)
    await loader.ready();
    equals(loader.key, undefined);
    equals(loader.keyId, undefined);
  });
});

describe("basic Database with subscription", function () {
  let db: Database;
  let didRun: number
  let unsubscribe: () => void
  let lastDoc: DocWithId<NonNullable<unknown>>;
  let waitForSub: Promise<void>;
  afterEach(async () => {
    await db.close();
    await db.destroy();
  })
  beforeEach(async function () {
    await SysContainer.start();
    db = new Database()
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
  it("should run on put", async function () {
    const all = await db.allDocs();
    equals(all.rows.length, 0);
    const doc = { _id: "hello", message: "world" };
    equals(didRun, 0);
    const ok = await db.put(doc);
    await waitForSub;
    assert(didRun);
    assert(lastDoc);
    assert(lastDoc._id);
    equals(ok.id, "hello");
    equals(didRun, 1);
  });
  it("should unsubscribe", async function () {

    unsubscribe();
    const doc = { _id: "hello", message: "again" };
    const ok = await db.put(doc);
    equals(ok.id, "hello");
    equals(didRun, 0);
  });
});

describe("basic Database with no update subscription", function () {
  let db: Database
  let didRun: number
  let unsubscribe: () => void
  afterEach(async () => {
    await db.close();
    await db.destroy();
  })
  beforeEach(async function () {
    await SysContainer.start();
    db = new Database();
    didRun = 0;

    unsubscribe = db.subscribe(() => {
      didRun++;
    });
  });
  it("should run on put", async function () {
    const all = await db.allDocs();
    equals(all.rows.length, 0);
    /** @type {Doc} */
    const doc = { _id: "hello", message: "world" };
    equals(didRun, 0);
    const ok = await db.put(doc);
    equals(ok.id, "hello");
    equals(didRun, 1);
  });
  it("should unsubscribe", async function () {
    unsubscribe();
    const doc = { _id: "hello", message: "again" };
    const ok = await db.put(doc);
    equals(ok.id, "hello");
    equals(didRun, 0);
  });
});

describe("database with files input", () => {
  let db: Database;
  let imagefiles: FileWithCid[] = [];
  let result: DbResponse;

  afterEach(async () => {
    await db.close();
    await db.destroy();
  })
  beforeEach(async function () {
    await SysContainer.start();
    imagefiles = await buildBlobFiles();
    db = new Database("fireproof-with-images");
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

  it("Should upload images", async function () {
    equals(result.id, "images-main");
  });

  it("Should fetch the images", async function () {
    const doc = await db.get(result.id);
    const files = doc._files
    assert(files);
    const keys = Object.keys(files);
    let fileMeta = files[keys[0]] as DocFileMeta;
    assert(fileMeta);
    assert(imagefiles[0].file.type);
    assert(fileMeta.type);
    equals(fileMeta.type, imagefiles[0].file.type);
    equals(fileMeta.size, imagefiles[0].file.size);
    equals(fileMeta.cid.toString(), imagefiles[0].cid);
    equals(typeof fileMeta.file, "function");
    let file = await fileMeta.file?.() as File;

    equals(file.type, imagefiles[0].file.type);
    equals(file.size, imagefiles[0].file.size);
    // equals(file.name, 'image.jpg') // see https://github.com/fireproof-storage/fireproof/issues/70

    fileMeta = files[keys[1]] as DocFileMeta;
    equals(fileMeta.type, imagefiles[1].file.type);
    equals(fileMeta.size, imagefiles[1].file.size);
    equals(fileMeta.cid.toString(), imagefiles[1].cid);
    equals(typeof fileMeta.file, "function");
    file = await fileMeta.file?.() as File;

    equals(file.type, imagefiles[1].file.type);
    equals(file.size, imagefiles[1].file.size);
    // equals(file.name, 'fireproof.png') // see https://github.com/fireproof-storage/fireproof/issues/70
  });

  it("should update the file document data without changing the files", async function () {
    interface Doc {
      type: string;
    }
    const doc = await db.get<Doc>(result.id);
    let files = doc._files || {};
    let keys = Object.keys(files);
    let fileMeta = files[keys[0]] as DocFileMeta;
    equals(fileMeta.type, imagefiles[0].file.type);
    equals(fileMeta.size, imagefiles[0].file.size);
    equals(fileMeta.cid.toString(), imagefiles[0].cid);
    equals(typeof fileMeta.file, "function");
    let file = await fileMeta.file?.() as File;

    equals(file.type, imagefiles[0].file.type);
    equals(file.size, imagefiles[0].file.size);

    doc.type = "images";
    const r2 = await db.put(doc);
    equals(r2.id, "images-main");
    const readDoc = await db.get<Doc>(r2.id);
    equals(readDoc.type, "images");
    files = readDoc._files || {};
    keys = Object.keys(files);
    fileMeta = files[keys[0]] as DocFileMeta;
    equals(fileMeta.type, imagefiles[0].file.type);
    equals(fileMeta.size, imagefiles[0].file.size);
    equals(fileMeta.cid.toString(), imagefiles[0].cid);
    equals(typeof fileMeta.file, "function");
    file = await fileMeta.file?.() as File;

    equals(file.type, imagefiles[0].file.type);
    equals(file.size, imagefiles[0].file.size);
  });
});

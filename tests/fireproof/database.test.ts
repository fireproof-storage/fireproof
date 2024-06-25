import { assert, equals, notEquals, matches, resetDirectory, dataDir, getDirectoryName, readImages } from "../helpers.js";
import { Database, DbResponse, DocFileMeta, DocWithId } from "@fireproof/core";
import { SysContainer } from "@fireproof/core/runtime";

function testDatabase(): Database {
  return new Database();
}

describe("basic Database", () => {
  let db: Database;
  beforeEach(async () => {
    await SysContainer.start();
    db = testDatabase();
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
  beforeEach(async function () {
    await SysContainer.start();
    db = testDatabase();
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
    const db2 = testDatabase();
    const { rows } = await db2.changes([]);
    equals(rows.length, 0);
    const doc = await db2.get("hello").catch((e) => e);
    assert(doc.message);
  });
});

describe("named Database with record", function () {
  interface Doc { readonly value: string }
  let db: Database;
  beforeEach(async function () {
    await SysContainer.start();
    await resetDirectory(dataDir(), "test-db-name");

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
    const loader = db._crdt.blockstore.loader;
    assert(loader)
    await loader.xready();
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
  beforeEach(async function () {
    await SysContainer.start();
    await resetDirectory(dataDir(), "test-parallel-writes");
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
    const loader = db._crdt.blockstore.loader;
    assert(loader)
    await loader.xready();
    equals(loader.key, undefined);
    equals(loader.keyId, undefined);
  });
});

describe("basic Database with subscription", function () {
  let db: Database;
  let didRun: number
  let unsubscribe: () => void
  let lastDoc: DocWithId<NonNullable<unknown>>;
  beforeEach(async function () {
    await SysContainer.start();
    db = testDatabase();
    didRun = 0;
    unsubscribe = db.subscribe((docs) => {
      lastDoc = docs[0];
      didRun++;
    }, true);
  });
  it("should run on put", async function () {
    const all = await db.allDocs();
    equals(all.rows.length, 0);
    const doc = { _id: "hello", message: "world" };
    equals(didRun, 0);
    const ok = await db.put(doc);
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
  beforeEach(async function () {
    await SysContainer.start();
    db = testDatabase();
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
  const imagefiles: File[] = [];
  let result: DbResponse;

  beforeAll(async function () {
    await SysContainer.start();
    const directoryname = getDirectoryName("tests/fireproof/test-images");
    const [jpg, png] = await readImages(directoryname, "test-images", ["image1.jpg", "fireproof.png"]);
    imagefiles.push(new File([new Blob([jpg])], `image.jpg`, { type: "image/jpeg" }));
    imagefiles.push(new File([new Blob([png])], `fireproof.png`, { type: "image/png" }));
  });

  beforeEach(async function () {
    await SysContainer.start();
    await resetDirectory(dataDir(), "fireproof-with-images");
    db = new Database("fireproof-with-images");
    const doc = {
      _id: "images-main",
      type: "files",
      _files: {
        one: imagefiles[0],
        two: imagefiles[1],
      },
    };
    result = await db.put(doc);
  });

  it("Should upload images", async function () {
    // console.log('These are the image files', imagefiles)

    // console.log(result, "This is the result when the images are stored")
    equals(result.id, "images-main");
  });

  it("Should fetch the images", async function () {
    const doc = await db.get(result.id);
    const files = doc._files || {};
    const keys = Object.keys(files);
    let fileMeta = files[keys[0]] as DocFileMeta;
    equals(fileMeta.type, "image/jpeg");
    equals(fileMeta.size, 5315);
    equals(fileMeta.cid.toString(), "bafkreig5oxyx6k5st3j2yeunaovbzuneathglic5pmcfrmeuh5kme4nogm");
    equals(typeof fileMeta.file, "function");
    let file = await fileMeta.file?.() as File;

    equals(file.type, "image/jpeg");
    equals(file.size, 5315);
    // equals(file.name, 'image.jpg') // see https://github.com/fireproof-storage/fireproof/issues/70

    fileMeta = files[keys[1]] as DocFileMeta;
    equals(fileMeta.type, "image/png");
    equals(fileMeta.size, 29917);
    equals(fileMeta.cid.toString(), "bafkreiculdb2bq7tg7jaxl6m5gf4vh5ta3kqck6knc7lotm3a7u6qvpoje");
    equals(typeof fileMeta.file, "function");
    file = await fileMeta.file?.() as File;

    equals(file.type, "image/png");
    equals(file.size, 29917);
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
    equals(fileMeta.type, "image/jpeg");
    equals(fileMeta.size, 5315);
    equals(fileMeta.cid.toString(), "bafkreig5oxyx6k5st3j2yeunaovbzuneathglic5pmcfrmeuh5kme4nogm");
    equals(typeof fileMeta.file, "function");
    let file = await fileMeta.file?.() as File;

    equals(file.type, "image/jpeg");
    equals(file.size, 5315);

    doc.type = "images";
    const r2 = await db.put(doc);
    equals(r2.id, "images-main");
    const readDoc = await db.get<Doc>(r2.id);
    equals(readDoc.type, "images");
    files = readDoc._files || {};
    keys = Object.keys(files);
    fileMeta = files[keys[0]] as DocFileMeta;
    equals(fileMeta.type, "image/jpeg");
    equals(fileMeta.size, 5315);
    equals(fileMeta.cid.toString(), "bafkreig5oxyx6k5st3j2yeunaovbzuneathglic5pmcfrmeuh5kme4nogm");
    equals(typeof fileMeta.file, "function");
    file = await fileMeta.file?.() as File;

    equals(file.type, "image/jpeg");
    equals(file.size, 5315);
  });
});

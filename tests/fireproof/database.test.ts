import { buildBlobFiles, FileWithCid } from "../helpers.js";
import { rt, bs, Database, DocResponse, DocFileMeta, DocWithId, DocFiles } from "@fireproof/core";

describe("basic Database", () => {
  let db: Database;
  afterEach(async () => {
    await db.close();
    await db.destroy();
  });
  beforeEach(async () => {
    await rt.SysContainer.start();
    db = new Database();
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

describe("basic Database with record", function () {
  interface Doc {
    readonly value: string;
  }
  let db: Database;
  afterEach(async () => {
    await db.close();
    await db.destroy();
  });
  beforeEach(async function () {
    await rt.SysContainer.start();
    db = new Database();
    const ok = await db.put<Doc>({ _id: "hello", value: "world" });
    expect(ok.id).toBe("hello");
  });
  it("should get", async function () {
    const doc = await db.get<Doc>("hello");
    expect(doc).toBeTruthy();
    expect(doc._id).toBe("hello");
    expect(doc.value).toBe("world");
  });
  it("should update", async function () {
    const ok = await db.put({ _id: "hello", value: "universe" });
    expect(ok.id).toBe("hello");
    const doc = await db.get<Doc>("hello");
    expect(doc).toBeTruthy();
    expect(doc._id).toBe("hello");
    expect(doc.value).toBe("universe");
  });
  it("should del last record", async function () {
    const ok = await db.del("hello");
    expect(ok.id).toBe("hello");

    const e = await db.get("hello").catch((e) => e);
    expect(e.message).toMatch(/Not found/);
  });
  it("has changes", async function () {
    const { rows } = await db.changes([]);
    expect(rows.length).toBe(1);
    expect(rows[0].key).toBe("hello");
    expect(rows[0].value._id).toBe("hello");
  });
  it("is not persisted", async function () {
    const db2 = new Database();
    const { rows } = await db2.changes([]);
    expect(rows.length).toBe(0);
    const doc = await db2.get("hello").catch((e) => e);
    expect(doc.message).toBeTruthy();
    await db2.close();
    await db2.destroy();
  });
});

describe("named Database with record", function () {
  interface Doc {
    readonly value: string;
  }
  let db: Database;
  afterEach(async () => {
    await db.close();
    await db.destroy();
  });
  beforeEach(async function () {
    await rt.SysContainer.start();
    db = new Database("test-db-name");
    /** @type {Doc} */
    const doc = { _id: "hello", value: "world" };
    const ok = await db.put(doc);
    expect(ok.id).toBe("hello");
  });
  it("should get", async function () {
    const doc = await db.get<Doc>("hello");
    expect(doc).toBeTruthy();
    expect(doc._id).toBe("hello");
    expect(doc.value).toBe("world");
  });
  it("should update", async function () {
    const ok = await db.put({ _id: "hello", value: "universe" });
    expect(ok.id).toBe("hello");
    const doc = await db.get<Doc>("hello");
    expect(doc).toBeTruthy();
    expect(doc._id).toBe("hello");
    expect(doc.value).toBe("universe");
  });
  it("should del last record", async function () {
    const ok = await db.del("hello");
    expect(ok.id).toBe("hello");

    const e = await db.get("hello").catch((e) => e);
    expect(e.message).toMatch(/Not found/);
  });
  it("has changes", async function () {
    const { rows } = await db.changes([]);
    expect(rows.length).toBe(1);
    expect(rows[0].key).toBe("hello");
    expect(rows[0].value._id).toBe("hello");
  });
  it("should have a key", async function () {
    const { rows } = await db.changes([]);
    expect(rows.length).toBe(1);
    const blocks = db._crdt.blockstore as bs.EncryptedBlockstore;
    const loader = blocks.loader;
    expect(loader).toBeTruthy();
    await loader.ready();
    expect(loader.key?.length).toBe(64);
    expect(loader.keyId?.length).toBe(64);
    expect(loader.key).not.toBe(loader.keyId);
  });
  it("should work right with a sequence of changes", async function () {
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

  it("should work right after compaction", async function () {
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
  const writes: Promise<DocResponse>[] = [];
  afterEach(async () => {
    await db.close();
    await db.destroy();
  });
  beforeEach(async function () {
    await rt.SysContainer.start();
    db = new Database("test-parallel-writes", { public: true });
    for (let i = 0; i < 10; i++) {
      const doc = { _id: `id-${i}`, hello: "world" };
      writes.push(db.put(doc));
    }
    await Promise.all(writes);
  });
  it("should have one head", function () {
    const crdt = db._crdt;
    expect(crdt.clock.head.length).toBe(1);
  });
  it("should write all", async function () {
    for (let i = 0; i < 10; i++) {
      const id = `id-${i}`;
      const doc = await db.get<{ hello: string }>(id);
      expect(doc).toBeTruthy();
      expect(doc._id).toBe(id);
      expect(doc.hello).toBe("world");
    }
  });
  it("should del all", async function () {
    for (let i = 0; i < 10; i++) {
      const id = `id-${i}`;
      const ok = await db.del(id);
      expect(ok.id).toBe(id);

      const e = await db.get(id).catch((e) => e);
      expect(e.message).toMatch(/Not found/);
    }
  });
  it("should delete all in parallel", async function () {
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
  it("has changes", async function () {
    const { rows, clock } = await db.changes([]);
    expect(clock[0]).toBe(db._crdt.clock.head[0]);
    expect(rows.length).toBe(10);
    // rows.sort((a, b) => a.key.localeCompare(b.key));
    for (let i = 0; i < 10; i++) {
      expect(rows[i].key).toBe("id-" + i);
      expect(rows[i].clock).toBeTruthy();
    }
  });
  it("should not have a key", async function () {
    const { rows } = await db.changes([]);
    expect(rows.length).toBe(10);
    expect(db.opts.public).toBeTruthy();
    expect(db._crdt.opts.public).toBeTruthy();
    const blocks = db._crdt.blockstore as bs.EncryptedBlockstore;
    const loader = blocks.loader;
    expect(loader).toBeTruthy();
    await loader.ready();
    expect(loader.key).toBeUndefined();
    expect(loader.keyId).toBeUndefined();
  });
});

describe("basic Database with subscription", function () {
  let db: Database;
  let didRun: number;
  let unsubscribe: () => void;
  let lastDoc: DocWithId<NonNullable<unknown>>;
  let waitForSub: Promise<void>;
  afterEach(async () => {
    await db.close();
    await db.destroy();
  });
  beforeEach(async function () {
    await rt.SysContainer.start();
    db = new Database();
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
  it("should unsubscribe", async function () {
    unsubscribe();
    const doc = { _id: "hello", message: "again" };
    const ok = await db.put(doc);
    expect(ok.id).toBe("hello");
    expect(didRun).toBe(0);
  });
});

describe("basic Database with no update subscription", function () {
  let db: Database;
  let didRun: number;
  let unsubscribe: () => void;
  afterEach(async () => {
    await db.close();
    await db.destroy();
  });
  beforeEach(async function () {
    await rt.SysContainer.start();
    db = new Database();
    didRun = 0;

    unsubscribe = db.subscribe(() => {
      didRun++;
    });
  });
  it("should run on put", async function () {
    const all = await db.allDocs();
    expect(all.rows.length).toBe(0);
    /** @type {Doc} */
    const doc = { _id: "hello", message: "world" };
    expect(didRun).toBe(0);
    const ok = await db.put(doc);
    expect(ok.id).toBe("hello");
    expect(didRun).toBe(1);
  });
  it("should unsubscribe", async function () {
    unsubscribe();
    const doc = { _id: "hello", message: "again" };
    const ok = await db.put(doc);
    expect(ok.id).toBe("hello");
    expect(didRun).toBe(0);
  });
});

describe("database with files input", () => {
  let db: Database;
  let imagefiles: FileWithCid[] = [];
  let result: DocResponse;

  afterEach(async () => {
    await db.close();
    await db.destroy();
  });
  beforeEach(async function () {
    await rt.SysContainer.start();
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
    expect(result.id).toBe("images-main");
  });

  it("Should fetch the images", async function () {
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

  it("should update the file document data without changing the files", async function () {
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
  });
});

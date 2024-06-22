import { assert, equals, notEquals, equalsJSON, resetDirectory, dataDir, sleep } from "./helpers";
import { CID } from "multiformats/cid";

import { fireproof, Database, index, DbResponse, IndexRows, DocWithId, Index, MapFn } from "../../src/index";
import { AnyLink } from "../../src/storage-engine";


export function carLogIncludesGroup(list: AnyLink[], cid: CID) {
  return list.some((c) => c.equals(cid));
}

interface FooType {
  readonly foo: string;
}

interface FireType {
  readonly fire: string;
}

describe("dreamcode", function () {
  interface Doc { text: string, dream: boolean }
  let ok: DbResponse
  let doc: DocWithId<Doc>
  let result: IndexRows<string, Doc>;
  let db: Database
  beforeEach(async function () {
    await resetDirectory(dataDir, "test-db");
    db = fireproof("test-db");
    ok = await db.put({ _id: "test-1", text: "fireproof", dream: true });
    doc = await db.get(ok.id);
    result = await db.query("text", { range: ["a", "z"] });
  });
  it("should put", function () {
    assert(ok);
    equals(ok.id, "test-1");
  });
  it("should get", function () {
    equals(doc.text, "fireproof");
  });
  it("should query", function () {
    assert(result);
    assert(result.rows);
    equals(result.rows.length, 1);
    equals(result.rows[0].key, "fireproof");
  });
  it("should query with function", async function () {
    const result = await db.query<boolean, Doc>((doc) => doc.dream);
    assert(result);
    assert(result.rows);
    equals(result.rows.length, 1);
    equals(result.rows[0].key, true);
  });
});

describe("public API", function () {
  interface Doc { foo: string }
  let db: Database;
  let ok: DbResponse;
  let doc: DocWithId<Doc>;
  let query: IndexRows<string, Doc>;

  beforeEach(async function () {
    await resetDirectory(dataDir, "test-api");
    db = fireproof("test-api");
    // index = index(db, 'test-index', (doc) => doc.foo)
    ok = await db.put({ _id: "test", foo: "bar" });
    doc = await db.get("test");
    query = await db.query<string, Doc>((doc) => doc.foo);
  });
  it("should be a database instance", function () {
    assert(db);
    assert(db instanceof Database);
  });
  it("should put", function () {
    assert(ok);
    equals(ok.id, "test");
  });
  it("should get", function () {
    equals(doc.foo, "bar");
  });
  it("should query", function () {
    assert(query);
    assert(query.rows);
    equals(query.rows.length, 1);
    equals(query.rows[0].key, "bar");
  });
});

describe("basic database", function () {
  interface Doc { foo: string }
  let db: Database<Doc>;
  beforeEach(async function () {
    await resetDirectory(dataDir, "test-basic");
    db = new Database("test-basic");
  });
  it("can put with id", async function () {
    const ok = await db.put({ _id: "test", foo: "bar" });
    assert(ok);
    equals(ok.id, "test");
  });
  it("can put without id", async function () {
    const ok = await db.put({ foo: "bam" });
    assert(ok);
    const got = await db.get<Doc>(ok.id);
    equals(got.foo, "bam");
  });
  it("can define an index", async function () {
    const ok = await db.put({ _id: "test", foo: "bar" });
    assert(ok);
    const idx = index<string, { foo: string }>(db, "test-index", (doc) => doc.foo);
    const result = await idx.query();
    assert(result);
    assert(result.rows);
    equals(result.rows.length, 1);
    equals(result.rows[0].id, "bar");
  });
  it("can define an index with a default function", async function () {
    const ok = await db.put({ _id: "test", foo: "bar" });
    assert(ok);
    const idx = index(db, "foo");
    const result = await idx.query();
    assert(result);
    assert(result.rows);
    equals(result.rows.length, 1);
    equals(result.rows[0].id, "bar");
  });
});

describe("benchmarking with compaction", function () {
  let db: Database;
  beforeEach(async function () {
    // erase the existing test data
    await resetDirectory(dataDir, "test-benchmark-compaction");
    db = new Database("test-benchmark-compaction", { autoCompact: 3, public: true });
  });
  xit("passing: insert during compaction", async function () {
    const ok = await db.put({ _id: "test", foo: "fast" });
    assert(ok);
    equals(ok.id, "test");
    assert(db._crdt.clock.head);
    equals(db._crdt.clock.head.length, 1);

    const numDocs = 20000;
    const batchSize = 500;
    console.time(`insert and read ${numDocs} records`);

    const doing = null;
    for (let i = 0; i < numDocs; i += batchSize) {
      const ops: Promise<DbResponse>[] = [];
      db.put({ foo: "fast" });
      // await doing
      // doing = db.compact()
      db.put({ foo: "fast" });
      for (let j = 0; j < batchSize && i + j < numDocs; j++) {
        ops.push(
          db.put({
            data: Math.random(),
            fire: Math.random()
              .toString()
              .repeat(25 * 1024),
          }),
        );
      }
      const label = `write ${i} log ${db._crdt.blockstore.loader.carLog.length}`;
      console.time(label);
      db.put({
        data: Math.random(),
        fire: Math.random()
          .toString()
          .repeat(25 * 1024),
      });

      await Promise.all(ops);
      console.timeEnd(label);
    }
    await doing;
    console.timeEnd(`insert and read ${numDocs} records`);
  }, 20000000);
});

describe("benchmarking a database", function () {
  /** @type {Database} */
  let db: Database;
  beforeEach(async function () {
    // erase the existing test data
    await resetDirectory(dataDir, "test-benchmark");
    db = new Database("test-benchmark", { autoCompact: 100000, public: true });
    // db = new Database(null, {autoCompact: 100000})
  });

  // run benchmarking tests
  // remove skip below
  // run:
  //      npm test -- --grep 'insert and read many records'
  //
  xit("passing: insert and read many records", async () => {
    const ok = await db.put({ _id: "test", foo: "fast" });
    assert(ok);
    equals(ok.id, "test");

    assert(db._crdt.clock.head);
    equals(db._crdt.clock.head.length, 1);

    const numDocs = 2500;
    const batchSize = 500;
    console.time(`insert and read ${numDocs} records`);

    for (let i = 0; i < numDocs; i += batchSize) {
      const ops: Promise<DbResponse>[] = [];
      for (let j = 0; j < batchSize && i + j < numDocs; j++) {
        ops.push(
          db
            .put({
              _id: `test${i + j}`,
              fire: Math.random()
                .toString()
                .repeat(25 * 1024),
            })
            .then((ok) => {
              db.get<{ fire: string }>(`test${i + j}`).then((doc) => {
                assert(doc.fire);
              });
              return ok
            }),
        );
      }
      await Promise.all(ops);
    }

    console.timeEnd(`insert and read ${numDocs} records`);

    // console.time('allDocs')
    // const allDocsResult2 = await db.allDocs()
    // console.timeEnd('allDocs')
    // equals(allDocsResult2.rows.length, numDocs+1)

    console.time("open new DB");
    const newDb = new Database("test-benchmark", { autoCompact: 100000, public: true });
    const doc = await newDb.get<{ foo: string }>("test");
    equals(doc.foo, "fast");
    console.timeEnd("open new DB");

    console.time("changes");
    const result = await db.changes(); // takes 1.5 seconds (doesn't have to load blocks from cars)
    console.timeEnd("changes");
    equals(result.rows.length, numDocs + 1);

    // this takes 1 minute w 1000 docs
    console.time("changes new DB");
    const result2 = await newDb.changes();
    console.timeEnd("changes new DB");
    equals(result2.rows.length, numDocs + 1);

    await sleep(1000);

    console.log("begin compact");

    await sleep(100);

    console.time("COMPACT");
    await db.compact();
    console.timeEnd("COMPACT");

    // todo compaction should not need this write to show in the new db
    await db.put({ _id: "compacted-test", foo: "bar" });

    // console.log('car log length', db._crdt.blockstore.loader.carLog.length)
    equals(db._crdt.blockstore.loader.carLog.length, 2);

    // console.time('allDocs new DB') // takes forever on 5k
    // const allDocsResult = await newDb.allDocs()
    // console.timeEnd('allDocs new DB')
    // equals(allDocsResult.rows.length, numDocs+1)
    await sleep(100);

    console.time("compacted reopen again");
    const newDb2 = new Database("test-benchmark", { autoCompact: 100000, public: true });
    const doc21 = await newDb2.get<FooType>("test");
    equals(doc21.foo, "fast");

    equals(newDb2._crdt.blockstore.loader.carLog.length, 2);

    const doc2 = await newDb2.get<FooType>("compacted-test");

    equals(doc2.foo, "bar");

    equals(doc2.foo, "bar");
    console.timeEnd("compacted reopen again");

    await sleep(100);

    console.time("compacted changes new DB2");
    const result3 = await newDb2.changes();
    console.timeEnd("compacted changes new DB2");
    equals(result3.rows.length, numDocs + 2);

    console.time("compacted newDb2 insert and read 100 records");
    const ops2: Promise<void>[] = [];
    for (let i = 0; i < 100; i++) {
      const ok = newDb2
        .put({
          _id: `test${i}`,
          fire: Math.random()
            .toString()
            .repeat(25 * 1024),
        })
        .then(() => {
          newDb2.get<{ fire: number }>(`test${i}`).then((doc) => {
            assert(doc.fire);
          });
        });
      ops2.push(ok);
    }
    await Promise.all(ops2);
    console.timeEnd("compacted newDb2 insert and read 100 records");

    // triggers OOM on my machine
    // await sleep(100)
    // console.time('compacted allDocs new DB2')
    // const allDocsResult3 = await newDb2.allDocs()
    // console.timeEnd('compacted allDocs new DB2')
    // equals(allDocsResult3.rows.length, numDocs+2)
  }, 20000000);
});

describe("Reopening a database", function () {
  interface Doc { foo: string }
  let db: Database
  beforeEach(async function () {
    // erase the existing test data
    await resetDirectory(dataDir, "test-reopen");

    db = new Database("test-reopen", { autoCompact: 100000 });
    const ok = await db.put({ _id: "test", foo: "bar" });
    assert(ok);
    equals(ok.id, "test");

    assert(db._crdt.clock.head);
    equals(db._crdt.clock.head.length, 1);
  });

  it("should persist data", async function () {
    const doc = await db.get<Doc>("test");
    equals(doc.foo, "bar");
  });

  it("should have the same data on reopen", async function () {
    const db2 = new Database("test-reopen");
    const doc = await db2.get<FooType>("test");
    equals(doc.foo, "bar");
    assert(db2._crdt.clock.head);
    equals(db2._crdt.clock.head.length, 1);
    equalsJSON(db2._crdt.clock.head, db._crdt.clock.head);
  });

  it("should have a car in the car log", async function () {
    await db._crdt.ready;
    assert(db._crdt.blockstore.loader);
    assert(db._crdt.blockstore.loader.carLog);
    equals(db._crdt.blockstore.loader.carLog.length, 1);
  });

  it("should have carlog after reopen", async function () {
    const db2 = new Database("test-reopen");
    await db2._crdt.ready;
    assert(db2._crdt.blockstore.loader);
    assert(db2._crdt.blockstore.loader.carLog);
    equals(db2._crdt.blockstore.loader.carLog.length, 1);
  });

  it("faster, should have the same data on reopen after reopen and update", async function () {
    for (let i = 0; i < 4; i++) {
      // console.log('iteration', i)
      const db = new Database("test-reopen");
      assert(db._crdt.ready);
      await db._crdt.ready;
      equals(db._crdt.blockstore.loader.carLog.length, i + 1);
      const ok = await db.put({ _id: `test${i}`, fire: "proof".repeat(50 * 1024) });
      assert(ok);
      equals(db._crdt.blockstore.loader.carLog.length, i + 2);
      const doc = await db.get<FireType>(`test${i}`);
      equals(doc.fire, "proof".repeat(50 * 1024));
    }
  }, 20000);

  xit("passing slow, should have the same data on reopen after reopen and update", async function () {
    for (let i = 0; i < 200; i++) {
      console.log("iteration", i);
      console.time("db open");
      const db = new Database("test-reopen", { autoCompact: 1000 }); // try with 10
      assert(db._crdt.ready);
      await db._crdt.ready;
      console.timeEnd("db open");
      equals(db._crdt.blockstore.loader.carLog.length, i + 1);
      // console.log('car log length', db._crdt.blockstore.loader.carLog.length)
      console.time("db put");
      const ok = await db.put({ _id: `test${i}`, fire: "proof".repeat(50 * 1024) });
      console.timeEnd("db put");
      assert(ok);
      equals(db._crdt.blockstore.loader.carLog.length, i + 2);
      console.time("db get");
      const doc = await db.get<FireType>(`test${i}`);
      console.timeEnd("db get");
      equals(doc.fire, "proof".repeat(50 * 1024));
    }
  }, 20000);
});

describe("Reopening a database with indexes", function () {
  interface Doc { foo: string }
  let db: Database
  let idx: Index<string, Doc>
  let didMap: boolean
  let mapFn: MapFn<Doc>
  beforeEach(async function () {
    // erase the existing test data
    await resetDirectory(dataDir, "test-reopen-idx");
    await resetDirectory(dataDir, "test-reopen-idx.idx");

    db = fireproof("test-reopen-idx");
    const ok = await db.put({ _id: "test", foo: "bar" });
    equals(ok.id, "test");

    didMap = false;

    const mapFn = (doc: Doc) => {
      didMap = true;
      return doc.foo;
    };
    idx = index<string, Doc>(db, "foo", mapFn);
  });

  it("should persist data", async function () {
    const doc = await db.get<Doc>("test");
    equals(doc.foo, "bar");
    const idx2 = index<string, Doc>(db, "foo");
    assert(idx2 === idx, "same object");
    const result = await idx2.query();
    assert(result);
    assert(result.rows);
    equals(result.rows.length, 1);
    equals(result.rows[0].id, "bar");
    assert(didMap);
  });

  it("should reuse the index", async function () {
    const idx2 = index(db, "foo", mapFn);
    assert(idx2 === idx, "same object");
    const result = await idx2.query();
    assert(result);
    assert(result.rows);
    equals(result.rows.length, 1);
    equals(result.rows[0].id, "bar");
    assert(didMap);
    didMap = false;
    const r2 = await idx2.query();
    assert(r2);
    assert(r2.rows);
    equals(r2.rows.length, 1);
    equals(r2.rows[0].id, "bar");
    assert(!didMap);
  });

  it("should have the same data on reopen", async function () {
    const db2 = fireproof("test-reopen-idx");
    const doc = await db2.get<FooType>("test");
    equals(doc.foo, "bar");
    assert(db2._crdt.clock.head);
    equals(db2._crdt.clock.head.length, 1);
    equalsJSON(db2._crdt.clock.head, db._crdt.clock.head);
  });

  it("should have the same data on reopen after a query", async function () {
    const r0 = await idx.query();
    assert(r0);
    assert(r0.rows);
    equals(r0.rows.length, 1);
    equals(r0.rows[0].key, "bar");

    const db2 = fireproof("test-reopen-idx");
    const doc = await db2.get<FooType>("test");
    equals(doc.foo, "bar");
    assert(db2._crdt.clock.head);
    equals(db2._crdt.clock.head.length, 1);
    equalsJSON(db2._crdt.clock.head, db._crdt.clock.head);
  });

  // it('should query the same data on reopen', async function () {
  //   const r0 = await idx.query()
  //   assert(r0)
  //   assert(r0.rows)
  //   equals(r0.rows.length, 1)
  //   equals(r0.rows[0].key, 'bar')

  //   const db2 = fireproof('test-reopen-idx')
  //   const d2 = await db2.get('test')
  //   equals(d2.foo, 'bar')
  //   didMap = false
  //   const idx3 = db2.index('foo', mapFn)
  //   const result = await idx3.query()
  //   assert(result)
  //   assert(result.rows)
  //   equals(result.rows.length, 1)
  //   equals(result.rows[0].key, 'bar')
  //   assert(!didMap)
  // })
});

describe("basic js verify", function () {
  it("should include cids in arrays", async function () {
    await resetDirectory(dataDir, "test-verify");
    const db = fireproof("test-verify");
    const ok = await db.put({ _id: "test", foo: ["bar", "bam"] });
    equals(ok.id, "test");
    const ok2 = await db.put({ _id: "test2", foo: ["bar", "bam"] });
    equals(ok2.id, "test2");
    const cid = db._crdt.blockstore.loader.carLog[0][0];
    const cid2 = db._crdt.clock.head[0];
    notEquals(cid, cid2);
    assert(cid !== cid2);
    const cidList = [cid, cid2];
    const cid3 = CID.parse(cid.toString());
    assert(!cidList.includes(cid3)); // sad trombone
    assert(carLogIncludesGroup(cidList, cid3));
  });
});

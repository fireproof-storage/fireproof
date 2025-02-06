import { sleep, storageURL } from "../helpers.js";
import { docs } from "./fireproof.test.fixture.js";
import { CID } from "multiformats/cid";

import {
  ConfigOpts,
  DocResponse,
  DocWithId,
  Index,
  IndexRows,
  MapFn,
  bs,
  index,
  ensureSuperThis,
  fireproof,
  Database,
  isDatabase,
  PARAM,
} from "@fireproof/core";
import { URI } from "@adviser/cement";

export function carLogIncludesGroup(list: bs.AnyLink[], cid: CID) {
  return list.some((c) => c.equals(cid));
}

interface FooType {
  readonly foo: string;
}

interface FireType {
  readonly fire: string;
}

describe("dreamcode", function () {
  interface Doc {
    text: string;
    dream: boolean;
  }
  let ok: DocResponse;
  let doc: DocWithId<Doc>;
  let result: IndexRows<string, Doc>;
  let db: Database;
  const sthis = ensureSuperThis();
  afterEach(async function () {
    await db.close();
    await db.destroy();
  });
  beforeEach(async function () {
    await sthis.start();
    db = fireproof("test-db");
    ok = await db.put({ _id: "test-1", text: "fireproof", dream: true });
    doc = await db.get(ok.id);
    result = await db.query("text", { range: ["a", "z"] });
  });
  it("should put", function () {
    expect(ok).toBeTruthy();
    expect(ok.id).toBe("test-1");
  });
  it("should get", function () {
    expect(doc.text).toBe("fireproof");
  });
  it("should query", function () {
    expect(result).toBeTruthy();
    expect(result.rows).toBeTruthy();
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].key).toBe("fireproof");
  });
  it("should query with function", async function () {
    const result = await db.query<boolean, Doc>((doc) => doc.dream);
    expect(result).toBeTruthy();
    expect(result.rows).toBeTruthy();
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].key).toBe(true);
  });
});

describe("public API", function () {
  interface Doc {
    foo: string;
  }
  let db: Database;
  let ok: DocResponse;
  let doc: DocWithId<Doc>;
  let query: IndexRows<string, Doc>;
  const sthis = ensureSuperThis();

  afterEach(async () => {
    await db.close();
    await db.destroy();
  });

  beforeEach(async function () {
    await sthis.start();
    db = fireproof("test-api");
    // index = index(db, 'test-index', (doc) => doc.foo)
    ok = await db.put({ _id: "test", foo: "bar" });
    doc = await db.get("test");
    query = await db.query<string, Doc>((doc) => doc.foo);
  });
  it("should be a ledger instance", function () {
    expect(db).toBeTruthy();
    expect(isDatabase(db)).toBeTruthy();
  });
  it("should put", function () {
    expect(ok).toBeTruthy();
    expect(ok.id).toBe("test");
  });
  it("should get", function () {
    expect(doc.foo).toBe("bar");
  });
  it("should query", function () {
    expect(query).toBeTruthy();
    expect(query.rows).toBeTruthy();
    expect(query.rows.length).toBe(1);
    expect(query.rows[0].key).toBe("bar");
  });
});

describe("database fullconfig", () => {
  const sthis = ensureSuperThis();
  it("have the right name", async () => {
    let protocol: string | undefined;
    const url = sthis.env.get("FP_STORAGE_URL");
    if (url) {
      protocol = URI.from(url).protocol;
    }
    const base = bs.getDefaultURI(sthis, protocol);
    const db = fireproof("my-funky-name", {
      storeUrls: {
        base: base,
        // meta: `${base}/meta?taste=${taste}`,
        data: {
          meta: base.build().pathname("dist/full/meta"),
          data: base.build().pathname("dist/full/data"),
          wal: base.build().pathname("dist/full/wal"),
        },
        idx: {
          meta: base.build().pathname("dist/full/idx-meta"),
          data: base.build().pathname("dist/full/idx-data"),
          wal: base.build().pathname("dist/full/idx-wal"),
        },
        // wal: `${base}/wal?taste=${taste}`,
      },
    });

    const carStore = await db.ledger.crdt.blockstore.loader?.carStore();
    expect(carStore.url().getParam(PARAM.NAME)).toBe("my-funky-name");
    const metaStore = await db.ledger.crdt.blockstore.loader?.metaStore();
    expect(metaStore.url().getParam(PARAM.NAME)).toBe("my-funky-name");
    const walStore = await db.ledger.crdt.blockstore.loader?.WALStore();
    expect(walStore.url().getParam(PARAM.NAME)).toBe("my-funky-name");

    expect(db).toBeTruthy();
    expect(db.name).toBe("my-funky-name");
    await db.put({ _id: "test", foo: "bar" });
    expect(db.name).toBe("my-funky-name");
  });
});

describe("basic ledger", function () {
  interface Doc {
    foo: string;
  }
  let db: Database;
  const sthis = ensureSuperThis();
  afterEach(async function () {
    await db.close();
    await db.destroy();
  });
  beforeEach(async function () {
    await sthis.start();
    db = fireproof("test-basic");
  });
  it("can put with id", async function () {
    const ok = await db.put({ _id: "test", foo: "bar" });
    expect(ok).toBeTruthy();
    expect(ok.id).toBe("test");
  });
  it("can put without id", async function () {
    const ok = await db.put({ foo: "bam" });
    expect(ok).toBeTruthy();
    const got = await db.get<Doc>(ok.id);
    expect(got.foo).toBe("bam");
  });
  it("can bulk an array", async function () {
    const ok = await db.bulk([{ foo: "cool" }, { foo: "dude" }]);
    expect(ok).toBeTruthy();
    expect(ok.ids.length).toBe(2);
    const got = await db.get<Doc>(ok.ids[0]);
    expect(got.foo).toBe("cool");
    const got2 = await db.get<Doc>(ok.ids[1]);
    expect(got2.foo).toBe("dude");
  });
  it("can define an index", async function () {
    const ok = await db.put({ _id: "test", foo: "bar" });
    expect(ok).toBeTruthy();
    const idx = index<string, { foo: string }>(db, "test-index", (doc) => doc.foo);
    const result = await idx.query();
    expect(result).toBeTruthy();
    expect(result.rows).toBeTruthy();
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].key).toBe("bar");
  });
  it("can define an index with a default function", async function () {
    const ok = await db.put({ _id: "test", foo: "bar" });
    expect(ok).toBeTruthy();
    const idx = index(db, "foo");
    const result = await idx.query();
    expect(result).toBeTruthy();
    expect(result.rows).toBeTruthy();
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].key).toBe("bar");
  });
  it("should query with multiple successive functions", async function () {
    interface TestDoc {
      _id: string;
      foo: string;
      baz: string;
    }
    await db.put<TestDoc>({ _id: "test", foo: "bar", baz: "qux" });
    const query1 = await db.query<string, TestDoc>((doc) => {
      return doc.foo;
    });
    const query2 = await db.query<string, TestDoc>((doc) => {
      return doc.baz;
    });
    expect(query1).toBeTruthy();
    expect(query1.rows).toBeTruthy();
    expect(query1.rows.length).toBe(1);
    expect(query2).toBeTruthy();
    expect(query2.rows).toBeTruthy();
    expect(query2.rows.length).toBe(1);
  });
});

describe("benchmarking with compaction", function () {
  let db: Database;
  const sthis = ensureSuperThis();
  afterEach(async function () {
    await db.close();
    await db.destroy();
  });
  beforeEach(async function () {
    // erase the existing test data
    await sthis.start();
    db = fireproof("test-benchmark-compaction", { autoCompact: 3 });
  });
  it.skip("insert during compaction", async function () {
    const ok = await db.put({ _id: "test", foo: "fast" });
    expect(ok).toBeTruthy();
    expect(ok.id).toBe("test");
    expect(db.ledger.crdt.clock.head).toBeTruthy();
    expect(db.ledger.crdt.clock.head.length).toBe(1);

    const numDocs = 20;
    const batchSize = 5;

    const doing = null;
    for (let i = 0; i < numDocs; i += batchSize) {
      // console.log("batch", i, db.blockstore.loader?.carLog.length);
      const ops: Promise<DocResponse>[] = [];
      db.put({ foo: "fast" });
      // await doing
      // doing = db.compact()
      db.put({ foo: "fast" });
      for (let j = 0; j < batchSize && i + j < numDocs; j++) {
        ops.push(
          db.put({
            data: Math.random(),
            fire: Math.random().toString().repeat(25),
          }),
        );
      }
      const blocks = db.ledger.crdt.blockstore as bs.EncryptedBlockstore;
      const loader = blocks.loader;
      expect(loader).toBeTruthy();

      db.put({
        data: Math.random(),
        fire: Math.random().toString().repeat(25),
      });

      await Promise.all(ops);
      // console.log("batch done", i, db.blockstore.loader?.carLog.length);
    }
    await doing;
  });
});

describe("benchmarking a ledger", function () {
  let db: Database;
  const sthis = ensureSuperThis();
  afterEach(async function () {
    await db.close();
    await db.destroy();
  });
  beforeEach(async function () {
    await sthis.start();
    // erase the existing test data
    db = fireproof("test-benchmark", { autoCompact: 100000, public: true });
    // db = fireproof(null, {autoCompact: 100000})
  });

  // run benchmarking tests
  // remove skip below
  // run:
  //      npm test -- --grep 'insert and read many records'
  //
  it.skip("passing: insert and read many records", async () => {
    const ok = await db.put({ _id: "test", foo: "fast" });
    expect(ok).toBeTruthy();
    expect(ok.id).toBe("test");

    expect(db.ledger.crdt.clock.head).toBeTruthy();
    expect(db.ledger.crdt.clock.head.length).toBe(1);

    const numDocs = 2500;
    const batchSize = 500;
    // console.time(`insert and read ${numDocs} records`);

    for (let i = 0; i < numDocs; i += batchSize) {
      const ops: Promise<DocResponse>[] = [];
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
                expect(doc.fire).toBeTruthy();
              });
              return ok;
            }),
        );
      }
      await Promise.all(ops);
    }

    // console.timeEnd(`insert and read ${numDocs} records`);

    // console.time('allDocs')
    // const allDocsResult2 = await db.allDocs()
    // console.timeEnd('allDocs')
    // equals(allDocsResult2.rows.length, numDocs+1)

    // console.time("open new DB");
    const newDb = fireproof("test-benchmark", { autoCompact: 100000, public: true });
    const doc = await newDb.get<{ foo: string }>("test");
    expect(doc.foo).toBe("fast");
    // console.timeEnd("open new DB");

    // console.time("changes");
    const result = await db.changes(); // takes 1.5 seconds (doesn't have to load blocks from cars)
    // console.timeEnd("changes");
    expect(result.rows.length).toBe(numDocs + 1);

    // this takes 1 minute w 1000 docs
    // console.time("changes new DB");
    const result2 = await newDb.changes();
    // console.timeEnd("changes new DB");
    expect(result2.rows.length).toBe(numDocs + 1);

    await sleep(1000);

    // console.log("begin compact");

    await sleep(100);

    // console.time("COMPACT");
    await db.compact();
    // console.timeEnd("COMPACT");

    // todo compaction should not need this write to show in the new db
    await db.put({ _id: "compacted-test", foo: "bar" });

    // console.log('car log length', db._crdt.blockstore.loader.carLog.length)
    const blocks = db.ledger.crdt.blockstore as bs.EncryptedBlockstore;
    const loader = blocks.loader;
    expect(loader).toBeTruthy();
    expect(loader.carLog.length).toBe(2);

    // console.time('allDocs new DB') // takes forever on 5k
    // const allDocsResult = await newDb.allDocs()
    // console.timeEnd('allDocs new DB')
    // equals(allDocsResult.rows.length, numDocs+1)
    await sleep(100);

    // console.time("compacted reopen again");
    const newDb2 = fireproof("test-benchmark", { autoCompact: 100000, public: true });
    const doc21 = await newDb2.get<FooType>("test");
    expect(doc21.foo).toBe("fast");
    const blocks2 = newDb2.ledger.crdt.blockstore as bs.EncryptedBlockstore;
    const loader2 = blocks2.loader;
    expect(loader2).toBeTruthy();

    expect(loader2.carLog.length).toBe(2);

    const doc2 = await newDb2.get<FooType>("compacted-test");

    expect(doc2.foo).toBe("bar");

    expect(doc2.foo).toBe("bar");
    // console.timeEnd("compacted reopen again");

    await sleep(100);

    // console.time("compacted changes new DB2");
    const result3 = await newDb2.changes();
    // console.timeEnd("compacted changes new DB2");
    expect(result3.rows.length).toBe(numDocs + 2);

    // console.time("compacted newDb2 insert and read 100 records");
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
            expect(doc.fire).toBeTruthy();
          });
        });
      ops2.push(ok);
    }
    await Promise.all(ops2);
    // console.timeEnd("compacted newDb2 insert and read 100 records");

    // triggers OOM on my machine
    // await sleep(100)
    // console.time('compacted allDocs new DB2')
    // const allDocsResult3 = await newDb2.allDocs()
    // console.timeEnd('compacted allDocs new DB2')
    // equals(allDocsResult3.rows.length, numDocs+2)
  }, 20000000);
});

describe("Reopening a ledger", function () {
  interface Doc {
    foo: string;
  }
  let db: Database;
  const sthis = ensureSuperThis();
  afterEach(async function () {
    await db.close();
    await db.destroy();
  });
  beforeEach(async function () {
    // erase the existing test data
    await sthis.start();

    db = fireproof("test-reopen", { autoCompact: 100000 });
    const ok = await db.put({ _id: "test", foo: "bar" });
    expect(ok).toBeTruthy();
    expect(ok.id).toBe("test");

    expect(db.ledger.crdt.clock.head).toBeDefined();
    expect(db.ledger.crdt.clock.head.length).toBe(1);
  });

  it("should persist data", async function () {
    const doc = await db.get<Doc>("test");
    expect(doc.foo).toBe("bar");
  });

  it("should have the same data on reopen", async function () {
    const db2 = fireproof("test-reopen");
    const doc = await db2.get<FooType>("test");
    expect(doc.foo).toBe("bar");
    expect(db2.ledger.crdt.clock.head).toBeDefined();
    expect(db2.ledger.crdt.clock.head.length).toBe(1);
    expect(db2.ledger.crdt.clock.head).toEqual(db.ledger.crdt.clock.head);
    await db2.close();
  });

  it("should have a car in the car log", async function () {
    await db.ledger.crdt.ready();
    const blocks = db.ledger.crdt.blockstore as bs.EncryptedBlockstore;
    const loader = blocks.loader;
    expect(loader).toBeDefined();
    expect(loader.carLog).toBeDefined();
    expect(loader.carLog.length).toBe(1);
  });

  it("should have carlog after reopen", async function () {
    const db2 = fireproof("test-reopen");
    await db2.ledger.crdt.ready();
    const blocks = db2.ledger.crdt.blockstore as bs.EncryptedBlockstore;
    const loader = blocks.loader;
    expect(loader).toBeDefined();
    expect(loader.carLog).toBeDefined();
    expect(loader.carLog.length).toBe(1);
    await db2.close();
  });

  it("faster, should have the same data on reopen after reopen and update", async function () {
    for (let i = 0; i < 4; i++) {
      // console.log('iteration', i)
      const db = fireproof("test-reopen");
      // assert(db._crdt.xready());
      await db.ready();
      const blocks = db.ledger.crdt.blockstore as bs.EncryptedBlockstore;
      const loader = blocks.loader;
      expect(loader.carLog.length).toBe(i + 1);
      const ok = await db.put({ _id: `test${i}`, fire: "proof".repeat(50 * 1024) });
      expect(ok).toBeTruthy();
      expect(loader.carLog.length).toBe(i + 2);
      const doc = await db.get<FireType>(`test${i}`);
      expect(doc.fire).toBe("proof".repeat(50 * 1024));
      await db.close();
    }
  }, 20000);

  it.skip("passing slow, should have the same data on reopen after reopen and update", async function () {
    for (let i = 0; i < 200; i++) {
      // console.log("iteration", i);
      // console.time("db open");
      const db = fireproof("test-reopen", { autoCompact: 1000 }); // try with 10
      // assert(db._crdt.ready);
      await db.ready();
      // console.timeEnd("db open");
      const blocks = db.ledger.crdt.blockstore as bs.EncryptedBlockstore;
      const loader = blocks.loader;
      expect(loader).toBeDefined();
      expect(loader.carLog.length).toBe(i + 1);
      // console.log('car log length', loader.carLog.length)
      // console.time("db put");
      const ok = await db.put({ _id: `test${i}`, fire: "proof".repeat(50 * 1024) });
      // console.timeEnd("db put");
      expect(ok).toBeTruthy();
      expect(loader.carLog.length).toBe(i + 2);
      // console.time("db get");
      const doc = await db.get<FireType>(`test${i}`);
      // console.timeEnd("db get");
      expect(doc.fire).toBe("proof".repeat(50 * 1024));
    }
  }, 200000);
});

describe("Reopening a ledger with indexes", function () {
  interface Doc {
    foo: string;
  }
  let db: Database;
  let idx: Index<string, Doc>;
  let didMap: boolean;
  let mapFn: MapFn<Doc>;
  const sthis = ensureSuperThis();
  afterEach(async function () {
    await db.close();
    await db.destroy();
  });
  beforeEach(async function () {
    await sthis.start();
    db = fireproof("test-reopen-idx");
    const ok = await db.put({ _id: "test", foo: "bar" });
    expect(ok.id).toBe("test");

    didMap = false;

    mapFn = (doc: Doc) => {
      didMap = true;
      return doc.foo;
    };
    idx = index<string, Doc>(db, "foo", mapFn);
  });

  it("should persist data", async function () {
    const doc = await db.get<Doc>("test");
    expect(doc.foo).toBe("bar");
    const idx2 = index<string, Doc>(db, "foo");
    expect(idx2).toBe(idx);
    const result = await idx2.query();
    expect(result).toBeTruthy();
    expect(result.rows).toBeTruthy();
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].key).toBe("bar");
    expect(didMap).toBeTruthy();
  });

  it("should reuse the index", async function () {
    const idx2 = index(db, "foo", mapFn);
    expect(idx2).toBe(idx);
    const result = await idx2.query();
    expect(result).toBeTruthy();
    expect(result.rows).toBeTruthy();
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].key).toBe("bar");
    expect(didMap).toBeTruthy();
    didMap = false;
    const r2 = await idx2.query();
    expect(r2).toBeTruthy();
    expect(r2.rows).toBeTruthy();
    expect(r2.rows.length).toBe(1);
    expect(r2.rows[0].key).toBe("bar");
    expect(didMap).toBeFalsy();
  });

  it("should have the same data on reopen", async function () {
    const db2 = fireproof("test-reopen-idx");
    const doc = await db2.get<FooType>("test");
    expect(doc.foo).toBe("bar");
    expect(db2.ledger.crdt.clock.head).toBeTruthy();
    expect(db2.ledger.crdt.clock.head.length).toBe(1);
    expect(db2.ledger.crdt.clock.head).toEqual(db.ledger.crdt.clock.head);
  });

  it("should have the same data on reopen after a query", async function () {
    const r0 = await idx.query();
    expect(r0).toBeTruthy();
    expect(r0.rows).toBeTruthy();
    expect(r0.rows.length).toBe(1);
    expect(r0.rows[0].key).toBe("bar");

    const db2 = fireproof("test-reopen-idx");
    const doc = await db2.get<FooType>("test");
    expect(doc.foo).toBe("bar");
    expect(db2.ledger.crdt.clock.head).toBeTruthy();
    expect(db2.ledger.crdt.clock.head.length).toBe(1);
    expect(db2.ledger.crdt.clock.head).toEqual(db.ledger.crdt.clock.head);
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
  const sthis = ensureSuperThis();
  beforeAll(async function () {
    await sthis.start();
  });
  it("should include cids in arrays", async function () {
    const db = fireproof("test-verify");
    const ok = await db.put({ _id: "test", foo: ["bar", "bam"] });
    expect(ok.id).toBe("test");
    const ok2 = await db.put({ _id: "test2", foo: ["bar", "bam"] });
    expect(ok2.id).toBe("test2");
    const blocks = db.ledger.crdt.blockstore as bs.EncryptedBlockstore;
    const loader = blocks.loader;
    expect(loader).toBeTruthy();
    const cid = loader.carLog[0][0];
    const cid2 = db.ledger.crdt.clock.head[0];
    expect(cid).not.toBe(cid2);
    expect(cid).not.toBe(cid2);
    const cidList = [cid, cid2];
    const cid3 = CID.parse(cid.toString());
    expect(cidList.includes(cid3)).toBeFalsy(); // sad trombone
    expect(carLogIncludesGroup(cidList, cid3)).toBeTruthy();
    await db.close();
    await db.destroy();
  });
});

describe("same workload twice, same CID", function () {
  let dbA: Database;
  let dbB: Database;
  let headA: string;
  let headB: string;

  const sthis = ensureSuperThis();
  // let configA: any;
  // let configB: any;

  const configA: ConfigOpts = {
    storeUrls: {
      base: storageURL(sthis).build().setParam("storekey", "@test@"),
    },
  };

  const configB: ConfigOpts = {
    storeUrls: {
      base: storageURL(sthis).build().setParam("storekey", "@test@"),
    },
  };

  afterEach(async function () {
    await dbA.close();
    await dbA.destroy();
    await dbB.close();
    await dbB.destroy();
  });
  beforeEach(async function () {
    let ok: DocResponse;
    await sthis.start();
    // todo this fails because the test setup doesn't properly configure both ledgers to use the same key
    dbA = fireproof("test-dual-workload-a", configA);
    for (const doc of docs) {
      ok = await dbA.put(doc);
      expect(ok).toBeTruthy();
      expect(ok.id).toBeTruthy();
    }
    headA = dbA.ledger.crdt.clock.head.toString();

    // todo this fails because the test setup doesn't properly configure both ledgers to use the same key
    dbB = fireproof("test-dual-workload-b", configB);
    for (const doc of docs) {
      ok = await dbB.put(doc);
      expect(ok).toBeTruthy();
      expect(ok.id).toBeTruthy();
    }
    headB = dbB.ledger.crdt.clock.head.toString();
  });
  it("should have head A and B", async function () {
    expect(headA).toBeTruthy();
    expect(headB).toBeTruthy();
    expect(headA).toEqual(headB);
    expect(headA.length).toBeGreaterThan(10);
  });
  it("should have same car log", async function () {
    const logA = dbA.ledger.crdt.blockstore.loader?.carLog;
    expect(logA).toBeTruthy();
    assert(logA);
    expect(logA.length).toBe(docs.length);

    const logB = dbB.ledger.crdt.blockstore.loader?.carLog;
    expect(logB).toBeTruthy();
    assert(logB);
    expect(logB.length).toBe(docs.length);

    const logA2 = logA.map((c) => c.toString());
    const logB2 = logB.map((c) => c.toString());

    expect(logA2.length).toBe(logB2.length);

    // todo this fails because the test setup doesn't properly configure both ledgers to use the same key
    // expect(logA2).toEqual(logB2);
  });
  it("should have same car log after compact", async function () {
    await dbA.compact();
    await dbB.compact();

    const cmpLogA = dbA.ledger.crdt.blockstore.loader?.carLog;
    expect(cmpLogA).toBeTruthy();
    assert(cmpLogA);
    expect(cmpLogA.length).toBe(1);

    const cmpLogB = dbB.ledger.crdt.blockstore.loader?.carLog;
    expect(cmpLogB).toBeTruthy();
    assert(cmpLogB);
    expect(cmpLogB.length).toBe(1);

    const cmpLogA2 = cmpLogA.map((c) => c.toString());
    const cmpLogB2 = cmpLogB.map((c) => c.toString());

    expect(cmpLogA2.length).toBe(cmpLogB2.length);

    // todo this fails because the test setup doesn't properly configure both ledgers to use the same key
    // expect(cmpLogA2).toEqual(cmpLogB2);
  });
});

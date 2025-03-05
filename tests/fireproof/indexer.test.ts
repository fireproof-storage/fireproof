import {
  Index,
  index,
  CRDT,
  toStoreURIRuntime,
  bs,
  rt,
  defaultWriteQueueOpts,
  ensureSuperThis,
  LedgerOpts,
  Database,
  CRDTImpl,
  fireproof,
  IndexRow,
  arrayFromAsyncIterable,
} from "@fireproof/core";

interface TestType {
  readonly title: string;
  readonly score: number;
}

describe("basic Index", () => {
  let db: Database;
  let indexer: Index<string, TestType>;
  let didMap: boolean;
  const sthis = ensureSuperThis();
  afterEach(async () => {
    await db.close();
    await db.destroy();
    // await indexer.close();
    // await indexer.destroy();
  });
  beforeEach(async () => {
    await sthis.start();
    db = fireproof("test-indexer");
    await db.put({ title: "amazing" });
    await db.put({ title: "creative" });
    await db.put({ title: "bazillas" });
    indexer = new Index<string, TestType>(sthis, db.ledger.crdt, "hello", (doc) => {
      didMap = true;
      return doc.title;
    });
    await indexer.ready();
  });
  it("should have properties", function () {
    expect(indexer.crdt).toBe(db.ledger.crdt);
    // expect(indexer.crdt.name).toBe("test-indexer");
    expect(indexer.name).toBe("hello");
    expect(indexer.mapFn).toBeTruthy();
  });
  it("should call the map function on first query", async () => {
    didMap = false;
    await indexer.query().toArray();
    expect(didMap).toBeTruthy();
  });
  it("should not call the map function on second query", async () => {
    await indexer.query().toArray();
    didMap = false;
    await indexer.query().toArray();
    expect(didMap).toBeFalsy();
  });
  it("should get results", async () => {
    const rows = await indexer.query().toArray();
    expect(rows).toBeTruthy();
    expect(rows.length).toBe(3);
  });
  it("should be in order", async () => {
    const rows = await indexer.query().toArray();
    expect(rows[0].key).toBe("amazing");
  });
  it("should work with limit", async () => {
    const rows = await indexer.query({ limit: 1 }).toArray();
    expect(rows.length).toBe(1);
  });
  it("should work with descending", async () => {
    const rows = await indexer.query({ descending: true }).toArray();
    expect(rows[0].key).toBe("creative");
  });
  it("should range query all", async () => {
    const rows = await indexer.query({ range: ["a", "z"] }).toArray();
    expect(rows.length).toBe(3);
    expect(rows[0].key).toBe("amazing");
  });
  it("should range query all twice", async () => {
    const rows = await indexer.query({ range: ["a", "z"] }).toArray();
    expect(rows.length).toBe(3);
    expect(rows[0].key).toBe("amazing");
    const rows2 = await indexer.query({ range: ["a", "z"] }).toArray();
    expect(rows2.length).toBe(3);
    expect(rows2[0].key).toBe("amazing");
  });
  it("should range query", async () => {
    const rows = await indexer.query({ range: ["b", "d"] }).toArray();
    expect(rows[0].key).toBe("bazillas");
  });
  it("should key query", async () => {
    const rows = await indexer.query({ key: "bazillas" }).toArray();
    expect(rows.length).toBe(1);
  });
  it("should include docs", async () => {
    const rows = await indexer.query().toArray();
    expect(rows[0]).toBeTruthy();
    expect(rows[0].id).toBeTruthy();
    expect(rows[0].doc).toBeTruthy();
    expect(rows[0].doc?._id).toBe(rows[0].id);
  });
});

describe("Index query with compound key", function () {
  let db: Database;
  let indexer: Index<[string, number], TestType>;
  const sthis = ensureSuperThis();
  afterEach(async () => {
    await db.close();
    await db.destroy();
    // await indexer.close();
    // await indexer.destroy();
  });
  beforeEach(async () => {
    await sthis.start();
    db = fireproof("test-indexer");
    await db.put({ title: "amazing", score: 1 });
    await db.put({ title: "creative", score: 2 });
    await db.put({ title: "creative", score: 20 });
    await db.put({ title: "bazillas", score: 3 });
    indexer = new Index<[string, number], TestType>(sthis, db.ledger.crdt, "hello", (doc) => {
      return [doc.title, doc.score];
    });
    await indexer.ready();
  });
  it("should prefix query", async () => {
    const rows = await indexer.query({ prefix: "creative" }).toArray();
    expect(rows.length).toBe(2);
    expect(rows[0].key).toEqual(["creative", 2]);
    expect(rows[1].key).toEqual(["creative", 20]);
  });
});

describe("basic Index with map fun", function () {
  let db: Database;
  let indexer: Index<string, TestType>;
  const sthis = ensureSuperThis();
  afterEach(async () => {
    await db.close();
    await db.destroy();
    // await indexer.close();
    // await indexer.destroy();
  });
  beforeEach(async () => {
    await sthis.start();
    db = fireproof("test-indexer");
    await db.put({ title: "amazing" });
    await db.put({ title: "creative" });
    await db.put({ title: "bazillas" });
    indexer = new Index<string, TestType>(sthis, db.ledger.crdt, "hello", (doc, map) => {
      map(doc.title);
    });
    await indexer.ready();
  });
  it("should get results", async () => {
    const rows = await indexer.query().toArray();
    expect(rows).toBeTruthy();
    expect(rows.length).toBe(3);
    expect(rows[0].key).toBe("amazing");
  });
});

describe("basic Index with map fun with value", function () {
  let db: Database;
  let indexer: Index<string, TestType, number>;
  const sthis = ensureSuperThis();
  afterEach(async () => {
    await db.close();
    await db.destroy();
  });
  beforeEach(async () => {
    await sthis.start();
    db = fireproof("test-indexer");
    await db.put({ title: "amazing" });
    await db.put({ title: "creative" });
    await db.put({ title: "bazillas" });
    indexer = new Index<string, TestType, number>(sthis, db.ledger.crdt, "hello", (doc, map) => {
      map(doc.title, doc.title.length);
    });
  });
  it("should get results", async () => {
    const rows = await indexer.query().toArray();
    expect(rows).toBeTruthy();
    expect(rows.length).toBe(3);
    expect(rows[0].key).toBe("amazing");
    // @jchris why is this not a object?
    expect(rows[0].value).toBe(7);
  });
  it("should include docs", async () => {
    const rows = await indexer.query().toArray();
    expect(rows[0].doc).toBeTruthy();
    expect(rows[0].doc?._id).toBe(rows[0].id);
    expect(rows.length).toBe(3);
    expect(rows[0].key).toBe("amazing");
    // @jchris why is this not a object?
    expect(rows[0].value).toBe(7);
  });
});

describe("Index query with map and compound key", function () {
  let db: Database;
  let indexer: Index<[string, number], TestType>;
  const sthis = ensureSuperThis();
  afterEach(async () => {
    await db.close();
    await db.destroy();
    // await indexer.close();
    // await indexer.destroy();
  });
  beforeEach(async () => {
    await sthis.start();
    db = fireproof("test-indexer");
    await db.put({ title: "amazing", score: 1 });
    await db.put({ title: "creative", score: 2 });
    await db.put({ title: "creative", score: 20 });
    await db.put({ title: "bazillas", score: 3 });
    indexer = new Index<[string, number], TestType>(sthis, db.ledger.crdt, "hello", (doc, emit) => {
      emit([doc.title, doc.score]);
    });
    await indexer.ready();
  });
  it("should prefix query", async () => {
    const rows = await indexer.query({ prefix: "creative" }).toArray();
    expect(rows.length).toBe(2);
    expect(rows[0].key).toEqual(["creative", 2]);
    expect(rows[1].key).toEqual(["creative", 20]);
  });
});

describe("basic Index with string fun", function () {
  let db: Database;
  let indexer: Index<string, TestType>;
  const sthis = ensureSuperThis();
  afterEach(async () => {
    await db.close();
    await db.destroy();
    // await indexer.close();
    // await indexer.destroy();
  });
  beforeEach(async () => {
    await sthis.start();
    db = fireproof("test-indexer");
    await db.put({ title: "amazing" });
    await db.put({ title: "creative" });
    await db.put({ title: "bazillas" });
    indexer = new Index<string, TestType>(sthis, db.ledger.crdt, "title");
    await indexer.ready();
  });
  it("should get results", async () => {
    const rows = await indexer.query().toArray();
    expect(rows).toBeTruthy();
    expect(rows.length).toBe(3);
  });
  it("should include docs", async () => {
    const rows = await indexer.query().toArray();
    expect(rows.length).toBeTruthy();
    expect(rows[0].doc).toBeTruthy();
  });
});

describe("basic Index with string fun and numeric keys", function () {
  let db: Database;
  let indexer: Index<string, TestType>;
  const sthis = ensureSuperThis();
  afterEach(async () => {
    await db.close();
    await db.destroy();
    // await indexer.close();
    // await indexer.destroy();
  });
  beforeEach(async () => {
    await sthis.start();
    db = fireproof("test-indexer");
    await db.put({ points: 0 });
    await db.put({ points: 1 });
    await db.put({ points: 2 });
    await db.put({ points: 3 });
    indexer = new Index<string, TestType>(sthis, db.ledger.crdt, "points");
    await indexer.ready();
  });
  it("should get results", async () => {
    const rows = await indexer.query().toArray();
    expect(rows).toBeTruthy();
    expect(rows.length).toBe(4);
  });
  it("should include docs", async () => {
    const rows = await indexer.query().toArray();
    expect(rows.length).toBeTruthy();
    expect(rows[0].doc).toBeTruthy();
  });
});

describe("basic Index upon cold start", function () {
  interface TestType {
    title: string;
    score?: number;
  }
  let crdt: CRDT;
  let indexer: Index<string, TestType>;
  let didMap: number;
  let mapFn: (doc: TestType) => string;
  let result: IndexRow<string, TestType, TestType>[];
  const sthis = ensureSuperThis();
  let dbOpts: LedgerOpts;
  // result, mapFn;
  afterEach(async () => {
    await crdt.close();
    await crdt.destroy();
    // await indexer.close();
    // await indexer.destroy();
  });
  beforeEach(async () => {
    await sthis.start();
    const logger = sthis.logger.With().Module("IndexerTest").Logger();
    logger.Debug().Msg("enter beforeEach");
    dbOpts = {
      name: "test-indexer-cold",
      writeQueue: defaultWriteQueueOpts({}),
      keyBag: rt.kb.defaultKeyBagOpts(sthis),
      storeUrls: toStoreURIRuntime(sthis, "test-indexer-cold"),
      storeEnDe: bs.ensureStoreEnDeFile({}),
    };
    crdt = new CRDTImpl(sthis, dbOpts);
    await crdt.bulk([
      { id: "abc1", value: { title: "amazing" } },
      { id: "abc2", value: { title: "creative" } },
      { id: "abc3", value: { title: "bazillas" } },
    ]);
    logger.Debug().Msg("post bulk beforeEach");
    didMap = 0;
    mapFn = (doc) => {
      didMap++;
      return doc.title;
    };
    indexer = index<string, TestType>(crdt, "hello", mapFn);
    logger.Debug().Msg("post index beforeEach");
    await indexer.ready();
    logger.Debug().Msg("post indexer.ready beforeEach");
    // new Index(db._crdt.indexBlockstore, db._crdt, 'hello', mapFn)
    result = await indexer.query().toArray();

    logger.Debug().Msg("post indexer.query beforeEach");
    expect(indexer.indexHead).toEqual(crdt.clock.head);
  });
  it("should call map on first query", function () {
    expect(didMap).toBeTruthy();
    expect(didMap).toEqual(3);
  });
  it("should get results on first query", function () {
    expect(result).toBeTruthy();
    expect(result.length).toEqual(3);
  });
  it("should work on cold load", async () => {
    const crdt2 = new CRDTImpl(sthis, dbOpts);
    await crdt2.ready();
    const result = await arrayFromAsyncIterable(crdt2.changes());
    const head = crdt2.clock.head;
    expect(result).toBeTruthy();
    await crdt2.ready();
    const indexer2 = index<string, TestType>(crdt2, "hello", mapFn);
    await indexer2.ready();
    const result2 = await indexer2.query().toArray();
    expect(indexer2.indexHead).toEqual(head);
    expect(result2).toBeTruthy();
    expect(result2.length).toEqual(3);
    expect(indexer2.indexHead).toEqual(head);
  });
  it.skip("should not rerun the map function on seen changes", async () => {
    didMap = 0;
    const crdt2 = new CRDTImpl(sthis, dbOpts);
    const indexer2 = index(crdt2, "hello", mapFn);
    const result = await arrayFromAsyncIterable(crdt2.changes([]));
    const head = [...crdt2.clock.head];
    expect(result.length).toEqual(3);
    expect(head.length).toEqual(1);
    const ch2 = await arrayFromAsyncIterable(crdt2.changes(head));
    const h2 = [...crdt2.clock.head];
    expect(ch2.length).toEqual(0);
    expect(h2.length).toEqual(1);
    expect(h2).toEqual(head);
    const result2 = await indexer2.query().toArray();
    expect(indexer2.indexHead).toEqual(head);
    expect(result2).toBeTruthy();
    expect(result2.length).toEqual(3);
    expect(didMap).toEqual(0);
    await crdt2.bulk([{ id: "abc4", value: { title: "despicable", score: 0 } }]);

    const ch3 = await arrayFromAsyncIterable(crdt2.changes(head));
    const h3 = [...crdt2.clock.head];
    expect(ch3.length).toEqual(1);
    expect(h3.length).toEqual(1);
    const result3 = await indexer2.query().toArray();
    expect(result3).toBeTruthy();
    expect(result3.length).toEqual(4);
    expect(didMap).toEqual(1);
  });
  it("should ignore meta when map function definiton changes", async () => {
    const crdt2 = new CRDTImpl(sthis, dbOpts);
    const result = await index<string, TestType>(crdt2, "hello", (doc) => doc.title.split("").reverse().join(""))
      .query()
      .toArray();

    expect(result.length).toEqual(3);
    expect(result[0].key).toEqual("evitaerc"); // creative
  });
});

describe("basic Index with no data", function () {
  let db: Database;
  let indexer: Index<string, TestType>;
  let didMap: boolean;
  const sthis = ensureSuperThis();
  afterEach(async () => {
    await db.close();
    await db.destroy();
    // await indexer.close();
    // await indexer.destroy();
  });
  beforeEach(async () => {
    await sthis.start();
    db = fireproof("test-indexer");
    indexer = new Index<string, TestType>(sthis, db.ledger.crdt, "hello", (doc) => {
      didMap = true;
      return doc.title;
    });
    await indexer.ready();
  });
  it("should have properties", function () {
    expect(indexer.crdt).toEqual(db.ledger.crdt);
    expect(indexer.name).toEqual("hello");
    expect(indexer.mapFn).toBeTruthy();
  });
  it("should not call the map function on first query", async () => {
    didMap = false;
    await indexer.query().toArray();
    expect(didMap).toBeFalsy();
  });
  it("should not call the map function on second query", async () => {
    await indexer.query().toArray();
    didMap = false;
    await indexer.query().toArray();
    expect(didMap).toBeFalsy();
  });
  it("should get results", async () => {
    const result = await indexer.query().toArray();
    expect(result).toBeTruthy();
    expect(result.length).toEqual(0);
  });
});

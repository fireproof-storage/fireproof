import {
  Index,
  index,
  CRDT,
  IndexRows,
  toStoreURIRuntime,
  bs,
  rt,
  defaultWriteQueueOpts,
  ensureSuperThis,
  LedgerOpts,
  Database,
  CRDTImpl,
  fireproof,
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
  afterEach(async function () {
    await db.close();
    await db.destroy();
    // await indexer.close();
    // await indexer.destroy();
  });
  beforeEach(async function () {
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
  it("should call the map function on first query", async function () {
    didMap = false;
    await indexer.query();
    expect(didMap).toBeTruthy();
  });
  it("should not call the map function on second query", async function () {
    await indexer.query();
    didMap = false;
    await indexer.query();
    expect(didMap).toBeFalsy();
  });
  it("should get results", async function () {
    const result = await indexer.query();
    expect(result).toBeTruthy();
    expect(result.rows).toBeTruthy();
    expect(result.rows.length).toBe(3);
  });
  it("should be in order", async function () {
    const { rows } = await indexer.query();
    expect(rows[0].key).toBe("amazing");
  });
  it("should work with limit", async function () {
    const { rows } = await indexer.query({ limit: 1 });
    expect(rows.length).toBe(1);
  });
  it("should work with descending", async function () {
    const { rows } = await indexer.query({ descending: true });
    expect(rows[0].key).toBe("creative");
  });
  it("should range query all", async function () {
    const { rows } = await indexer.query({ range: ["a", "z"] });
    expect(rows.length).toBe(3);
    expect(rows[0].key).toBe("amazing");
  });
  it("should range query all twice", async function () {
    const { rows } = await indexer.query({ range: ["a", "z"] });
    expect(rows.length).toBe(3);
    expect(rows[0].key).toBe("amazing");
    const { rows: rows2 } = await indexer.query({ range: ["a", "z"] });
    expect(rows2.length).toBe(3);
    expect(rows2[0].key).toBe("amazing");
  });
  it("should range query", async function () {
    const { rows } = await indexer.query({ range: ["b", "d"] });
    expect(rows[0].key).toBe("bazillas");
  });
  it("should key query", async function () {
    const { rows } = await indexer.query({ key: "bazillas" });
    expect(rows.length).toBe(1);
  });
  it("should include docs", async function () {
    const { rows } = await indexer.query({ includeDocs: true });
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
  afterEach(async function () {
    await db.close();
    await db.destroy();
    // await indexer.close();
    // await indexer.destroy();
  });
  beforeEach(async function () {
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
  it("should prefix query", async function () {
    const { rows } = await indexer.query({ prefix: "creative" });
    expect(rows.length).toBe(2);
    expect(rows[0].key).toEqual(["creative", 2]);
    expect(rows[1].key).toEqual(["creative", 20]);
  });
});

describe("basic Index with map fun", function () {
  let db: Database;
  let indexer: Index<string, TestType>;
  const sthis = ensureSuperThis();
  afterEach(async function () {
    await db.close();
    await db.destroy();
    // await indexer.close();
    // await indexer.destroy();
  });
  beforeEach(async function () {
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
  it("should get results", async function () {
    const result = await indexer.query();
    expect(result).toBeTruthy();
    expect(result.rows).toBeTruthy();
    expect(result.rows.length).toBe(3);
    expect(result.rows[0].key).toBe("amazing");
  });
});

describe("basic Index with map fun with value", function () {
  let db: Database;
  let indexer: Index<string, TestType, number>;
  const sthis = ensureSuperThis();
  afterEach(async function () {
    await db.close();
    await db.destroy();
  });
  beforeEach(async function () {
    await sthis.start();
    db = fireproof("test-indexer");
    await db.put({ title: "amazing" });
    await db.put({ title: "creative" });
    await db.put({ title: "bazillas" });
    indexer = new Index<string, TestType, number>(sthis, db.ledger.crdt, "hello", (doc, map) => {
      map(doc.title, doc.title.length);
    });
  });
  it("should get results", async function () {
    const result = await indexer.query();
    expect(result).toBeTruthy();
    expect(result.rows).toBeTruthy();
    expect(result.rows.length).toBe(3);
    expect(result.rows[0].key).toBe("amazing");
    // @jchris why is this not a object?
    expect(result.rows[0].value).toBe(7);
  });
  it("should include docs", async function () {
    const { rows } = await indexer.query({ includeDocs: true });
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
  afterEach(async function () {
    await db.close();
    await db.destroy();
    // await indexer.close();
    // await indexer.destroy();
  });
  beforeEach(async function () {
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
  it("should prefix query", async function () {
    const { rows } = await indexer.query({ prefix: "creative" });
    expect(rows.length).toBe(2);
    expect(rows[0].key).toEqual(["creative", 2]);
    expect(rows[1].key).toEqual(["creative", 20]);
  });
});

describe("basic Index with string fun", function () {
  let db: Database;
  let indexer: Index<string, TestType>;
  const sthis = ensureSuperThis();
  afterEach(async function () {
    await db.close();
    await db.destroy();
    // await indexer.close();
    // await indexer.destroy();
  });
  beforeEach(async function () {
    await sthis.start();
    db = fireproof("test-indexer");
    await db.put({ title: "amazing" });
    await db.put({ title: "creative" });
    await db.put({ title: "bazillas" });
    indexer = new Index<string, TestType>(sthis, db.ledger.crdt, "title");
    await indexer.ready();
  });
  it("should get results", async function () {
    const result = await indexer.query();
    expect(result).toBeTruthy();
    expect(result.rows).toBeTruthy();
    expect(result.rows.length).toBe(3);
  });
  it("should include docs", async function () {
    const { rows } = await indexer.query();
    expect(rows.length).toBeTruthy();
    expect(rows[0].doc).toBeTruthy();
  });
});

describe("basic Index with string fun and numeric keys", function () {
  let db: Database;
  let indexer: Index<string, TestType>;
  const sthis = ensureSuperThis();
  afterEach(async function () {
    await db.close();
    await db.destroy();
    // await indexer.close();
    // await indexer.destroy();
  });
  beforeEach(async function () {
    await sthis.start();
    db = fireproof("test-indexer");
    await db.put({ points: 0 });
    await db.put({ points: 1 });
    await db.put({ points: 2 });
    await db.put({ points: 3 });
    indexer = new Index<string, TestType>(sthis, db.ledger.crdt, "points");
    await indexer.ready();
  });
  it("should get results", async function () {
    const result = await indexer.query();
    expect(result).toBeTruthy();
    expect(result.rows).toBeTruthy();
    expect(result.rows.length).toBe(4);
  });
  it("should include docs", async function () {
    const { rows } = await indexer.query();
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
  let result: IndexRows<string, TestType>;
  const sthis = ensureSuperThis();
  let dbOpts: LedgerOpts;
  // result, mapFn;
  afterEach(async function () {
    await crdt.close();
    await crdt.destroy();
    // await indexer.close();
    // await indexer.destroy();
  });
  beforeEach(async function () {
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
    indexer = await index<string, TestType>(crdt, "hello", mapFn);
    logger.Debug().Msg("post index beforeEach");
    await indexer.ready();
    logger.Debug().Msg("post indexer.ready beforeEach");
    // new Index(db._crdt.indexBlockstore, db._crdt, 'hello', mapFn)
    result = await indexer.query();

    logger.Debug().Msg("post indexer.query beforeEach");
    expect(indexer.indexHead).toEqual(crdt.clock.head);
  });
  it("should call map on first query", function () {
    expect(didMap).toBeTruthy();
    expect(didMap).toEqual(3);
  });
  it("should get results on first query", function () {
    expect(result).toBeTruthy();
    expect(result.rows).toBeTruthy();
    expect(result.rows.length).toEqual(3);
  });
  it("should work on cold load", async function () {
    const crdt2 = new CRDTImpl(sthis, dbOpts);
    await crdt2.ready();
    const { result, head } = await crdt2.changes();
    expect(result).toBeTruthy();
    await crdt2.ready();
    const indexer2 = await index<string, TestType>(crdt2, "hello", mapFn);
    await indexer2.ready();
    const result2 = await indexer2.query();
    expect(indexer2.indexHead).toEqual(head);
    expect(result2).toBeTruthy();
    expect(result2.rows.length).toEqual(3);
    expect(indexer2.indexHead).toEqual(head);
  });
  it.skip("should not rerun the map function on seen changes", async function () {
    didMap = 0;
    const crdt2 = new CRDTImpl(sthis, dbOpts);
    const indexer2 = await index(crdt2, "hello", mapFn);
    const { result, head } = await crdt2.changes([]);
    expect(result.length).toEqual(3);
    expect(head.length).toEqual(1);
    const { result: ch2, head: h2 } = await crdt2.changes(head);
    expect(ch2.length).toEqual(0);
    expect(h2.length).toEqual(1);
    expect(h2).toEqual(head);
    const result2 = await indexer2.query();
    expect(indexer2.indexHead).toEqual(head);
    expect(result2).toBeTruthy();
    expect(result2.rows.length).toEqual(3);
    expect(didMap).toEqual(0);
    await crdt2.bulk([{ id: "abc4", value: { title: "despicable", score: 0 } }]);

    const { result: ch3, head: h3 } = await crdt2.changes(head);
    expect(ch3.length).toEqual(1);
    expect(h3.length).toEqual(1);
    const result3 = await indexer2.query();
    expect(result3).toBeTruthy();
    expect(result3.rows.length).toEqual(4);
    expect(didMap).toEqual(1);
  });
  it("should ignore meta when map function definiton changes", async function () {
    const crdt2 = new CRDTImpl(sthis, dbOpts);
    const result = await index<string, TestType>(crdt2, "hello", (doc) => doc.title.split("").reverse().join("")).query();
    expect(result.rows.length).toEqual(3);
    expect(result.rows[0].key).toEqual("evitaerc"); // creative
  });
});

describe("basic Index with no data", function () {
  let db: Database;
  let indexer: Index<string, TestType>;
  let didMap: boolean;
  const sthis = ensureSuperThis();
  afterEach(async function () {
    await db.close();
    await db.destroy();
    // await indexer.close();
    // await indexer.destroy();
  });
  beforeEach(async function () {
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
  it("should not call the map function on first query", async function () {
    didMap = false;
    await indexer.query();
    expect(didMap).toBeFalsy();
  });
  it("should not call the map function on second query", async function () {
    await indexer.query();
    didMap = false;
    await indexer.query();
    expect(didMap).toBeFalsy();
  });
  it("should get results", async function () {
    const result = await indexer.query();
    expect(result).toBeTruthy();
    expect(result.rows).toBeTruthy();
    expect(result.rows.length).toEqual(0);
  });
});

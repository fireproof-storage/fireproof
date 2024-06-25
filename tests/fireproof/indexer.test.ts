import { Index, index, Database, CRDT, IndexRows } from "../../src/index.js";
import { SysContainer } from "../../src/runtime/sys-container.js";
import { assert, equals, resetDirectory, equalsJSON, dataDir } from "./helpers.js";

interface TestType {
  readonly title: string;
  readonly score: number;
}

describe("basic Index", () => {
  let db: Database<TestType>;
  let indexer: Index<string, TestType>;
  let didMap: boolean;
  beforeEach(async function () {
    await SysContainer.start();
    // console.log("resetting directory", dataDir(), "test-indexer");
    await resetDirectory(dataDir(), "test-indexer");
    // await sleep(1000);
    db = new Database("test-indexer");
    // await sleep(1000);
    await db.put({ title: "amazing" });
    await db.put({ title: "creative" });
    // const ok =
    await db.put({ title: "bazillas" });
    // console.log("okcount", count++, ok.id);
    indexer = new Index<string, TestType>(db._crdt, "hello", (doc) => {
      didMap = true;
      return doc.title;
    });
  });
  it("should have properties", function () {
    equals(indexer.crdt, db._crdt);
    equals(indexer.crdt.name, "test-indexer");
    equals(indexer.name, "hello");
    assert(indexer.mapFn);
  });
  it("should call the map function on first query", async function () {
    didMap = false;
    await indexer.query();
    assert(didMap);
  });
  it("should not call the map function on second query", async function () {
    await indexer.query();
    didMap = false;
    await indexer.query();
    assert(!didMap);
  });
  it("should get results", async function () {
    const result = await indexer.query();
    assert(result);
    assert(result.rows);
    equals(result.rows.length, 3);
  });
  it("should be in order", async function () {
    const { rows } = await indexer.query();
    equals(rows[0].key, "amazing");
  });
  it("should work with limit", async function () {
    const { rows } = await indexer.query({ limit: 1 });
    equals(rows.length, 1);
  });
  it("should work with descending", async function () {
    const { rows } = await indexer.query({ descending: true });
    equals(rows[0].key, "creative");
  });
  it("should range query all", async function () {
    const { rows } = await indexer.query({ range: ["a", "z"] });
    equals(rows.length, 3);
    equals(rows[0].key, "amazing");

  });
  it("should range query all twice", async function () {
    const { rows } = await indexer.query({ range: ["a", "z"] });
    equals(rows.length, 3);
    equals(rows[0].key, "amazing");
    const { rows: rows2 } = await indexer.query({ range: ["a", "z"] });
    equals(rows2.length, 3);
    equals(rows2[0].key, "amazing");
  });
  it("should range query", async function () {
    const { rows } = await indexer.query({ range: ["b", "d"] });
    equals(rows[0].key, "bazillas");
  });
  it("should key query", async function () {
    const { rows } = await indexer.query({ key: "bazillas" });
    equals(rows.length, 1);
  });
  it("should include docs", async function () {
    const { rows } = await indexer.query({ includeDocs: true });
    assert(rows[0]);
    assert(rows[0].id);
    assert(rows[0].doc);
    equals(rows[0].doc._id, rows[0].id);
  });
});

describe("Index query with compound key", function () {
  let db: Database<TestType>;
  let indexer: Index<[string, number], TestType>;
  beforeEach(async function () {
    await SysContainer.start();
    await resetDirectory(dataDir(), "test-indexer");
    db = new Database("test-indexer");
    await db.put({ title: "amazing", score: 1 });
    await db.put({ title: "creative", score: 2 });
    await db.put({ title: "creative", score: 20 });
    await db.put({ title: "bazillas", score: 3 });
    indexer = new Index<[string, number], TestType>(db._crdt, "hello", (doc) => {
      return [doc.title, doc.score];
    });
  });
  it("should prefix query", async function () {
    const { rows } = await indexer.query({ prefix: "creative" });
    equals(rows.length, 2);
    equalsJSON(rows[0].key, ["creative", 2]);
    equalsJSON(rows[1].key, ["creative", 20]);
  });
});

describe("basic Index with map fun", function () {
  let db: Database<TestType>;
  let indexer: Index<string, TestType>;
  beforeEach(async function () {
    await SysContainer.start();
    await resetDirectory(dataDir(), "test-indexer");

    db = new Database("test-indexer");
    await db.put({ title: "amazing" });
    await db.put({ title: "creative" });
    await db.put({ title: "bazillas" });
    indexer = new Index<string, TestType>(db._crdt, "hello", (doc, map) => {
      map(doc.title);
    });
  });
  it("should get results", async function () {
    const result = await indexer.query();
    assert(result);
    assert(result.rows);
    equals(result.rows.length, 3);
    equals(result.rows[0].key, "amazing");
  });
});

describe("basic Index with map fun with value", function () {
  let db: Database<TestType>;
  let indexer: Index<string, TestType, number>;
  beforeEach(async function () {
    await SysContainer.start();
    await resetDirectory(dataDir(), "test-indexer");

    db = new Database("test-indexer");
    await db.put({ title: "amazing" });
    await db.put({ title: "creative" });
    await db.put({ title: "bazillas" });
    indexer = new Index<string, TestType, number>(db._crdt, "hello", (doc, map) => {
      map(doc.title, doc.title.length);
    });
  });
  it("should get results", async function () {
    const result = await indexer.query();
    assert(result);
    assert(result.rows);
    equals(result.rows.length, 3);
    equals(result.rows[0].key, "amazing");
    // @jchris why is this not a object?
    equals(result.rows[0].value, 7);
  });
  it("should include docs", async function () {
    const { rows } = await indexer.query({ includeDocs: true });
    assert(rows[0].doc);
    equals(rows[0].doc._id, rows[0].id);
    equals(rows.length, 3);
    equals(rows[0].key, "amazing");
    // @jchris why is this not a object?
    equals(rows[0].value, 7);
  });
});

describe("Index query with map and compound key", function () {
  let db: Database<TestType>;
  let indexer: Index<[string, number], TestType>;
  beforeEach(async function () {
    await SysContainer.start();
    await resetDirectory(dataDir(), "test-indexer");
    db = new Database("test-indexer");
    await db.put({ title: "amazing", score: 1 });
    await db.put({ title: "creative", score: 2 });
    await db.put({ title: "creative", score: 20 });
    await db.put({ title: "bazillas", score: 3 });
    indexer = new Index<[string, number], TestType>(db._crdt, "hello", (doc, emit) => {
      emit([doc.title, doc.score]);
    });
  });
  it("should prefix query", async function () {
    const { rows } = await indexer.query({ prefix: "creative" });
    equals(rows.length, 2);
    equalsJSON(rows[0].key, ["creative", 2]);
    equalsJSON(rows[1].key, ["creative", 20]);
  });
});

describe("basic Index with string fun", function () {
  let db: Database<TestType>;
  let indexer: Index<string, TestType>;
  beforeEach(async function () {
    await SysContainer.start();
    await resetDirectory(dataDir(), "test-indexer");

    db = new Database("test-indexer");
    await db.put({ title: "amazing" });
    await db.put({ title: "creative" });
    await db.put({ title: "bazillas" });
    indexer = new Index(db._crdt, "title");
  });
  it("should get results", async function () {
    const result = await indexer.query();
    assert(result);
    assert(result.rows);
    equals(result.rows.length, 3);
  });
  it("should include docs", async function () {
    const { rows } = await indexer.query();
    assert(rows.length)
    assert(rows[0].doc);
  });
});

describe("basic Index upon cold start", function () {
  interface TestType {
    title: string;
    score?: number;
  }
  let crdt: CRDT<TestType>;
  let indexer: Index<string, TestType>;
  let didMap: number;
  let mapFn: (doc: TestType) => string;
  let result: IndexRows<string, TestType>;
  // result, mapFn;
  beforeEach(async function () {
    await SysContainer.start();
    await resetDirectory(dataDir(), "test-indexer-cold");
    await resetDirectory(dataDir(), "test-indexer-cold.idx");

    // db = database()
    crdt = new CRDT<TestType>("test-indexer-cold", { persistIndexes: true });
    await crdt.bulk([
      { id: "abc1", value: { title: "amazing" } },
      { id: "abc2", value: { title: "creative" } },
      { id: "abc3", value: { title: "bazillas" } },
    ]);
    didMap = 0;
    mapFn = (doc) => {
      didMap++;
      return doc.title;
    };
    indexer = await index<string, TestType>({ _crdt: crdt }, "hello", mapFn);
    // new Index(db._crdt.indexBlockstore, db._crdt, 'hello', mapFn)
    result = await indexer.query();
    equalsJSON(indexer.indexHead, crdt.clock.head);
  });
  it("should call map on first query", function () {
    assert(didMap);
    equals(didMap, 3);
  });
  it("should get results on first query", function () {
    assert(result);
    assert(result.rows);
    equals(result.rows.length, 3);
  });
  it("should work on cold load", async function () {
    const crdt2 = new CRDT<TestType>("test-indexer-cold", { persistIndexes: true });
    const { result, head } = await crdt2.changes();
    assert(result);
    await crdt2.ready;
    const indexer2 = await index<string, TestType>({ _crdt: crdt2 }, "hello", mapFn);
    await indexer2.xready();
    const result2 = await indexer2.query();
    equalsJSON(indexer2.indexHead, head);
    assert(result2);
    equals(result2.rows.length, 3);
    equalsJSON(indexer2.indexHead, head);
  });
  xit("should not rerun the map function on seen changes", async function () {
    didMap = 0;
    const crdt2 = new CRDT<TestType>("test-indexer-cold", { persistIndexes: true });
    const indexer2 = await index({ _crdt: crdt2 }, "hello", mapFn);
    const { result, head } = await crdt2.changes([]);
    equals(result.length, 3);
    equals(head.length, 1);
    const { result: ch2, head: h2 } = await crdt2.changes(head);
    equals(ch2.length, 0);
    equals(h2.length, 1);
    equalsJSON(h2, head);
    const result2 = await indexer2.query();
    equalsJSON(indexer2.indexHead, head);
    assert(result2);
    equals(result2.rows.length, 3);
    equals(didMap, 0);
    await crdt2.bulk([{ id: "abc4", value: { title: "despicable", score: 0 } }]);

    const { result: ch3, head: h3 } = await crdt2.changes(head);
    equals(ch3.length, 1);
    equals(h3.length, 1);
    const result3 = await indexer2.query();
    assert(result3);
    equals(result3.rows.length, 4);
    equals(didMap, 1);
  });
  it("should ignore meta when map function definiton changes", async function () {
    const crdt2 = new CRDT<TestType>("test-indexer-cold");
    const result = await index<string, TestType>({ _crdt: crdt2 }, "hello", (doc) =>
      doc.title.split("").reverse().join(""),
    ).query();
    equals(result.rows.length, 3);
    equals(result.rows[0].key, "evitaerc"); // creative
  });
});

describe("basic Index with no data", function () {
  let db: Database<TestType>;
  let indexer: Index<string, TestType>;
  let didMap: boolean;
  beforeEach(async function () {
    await SysContainer.start();
    await resetDirectory(dataDir(), "test-indexer");

    db = new Database("test-indexer");
    indexer = new Index<string, TestType>(db._crdt, "hello", (doc) => {
      didMap = true;
      return doc.title;
    });
  });
  it("should have properties", function () {
    equals(indexer.crdt, db._crdt);
    equals(indexer.name, "hello");
    assert(indexer.mapFn);
  });
  it("should not call the map function on first query", async function () {
    didMap = false;
    await indexer.query();
    assert(!didMap);
  });
  it("should not call the map function on second query", async function () {
    await indexer.query();
    didMap = false;
    await indexer.query();
    assert(!didMap);
  });
  it("should get results", async function () {
    const result = await indexer.query();
    assert(result);
    assert(result.rows);
    equals(result.rows.length, 0);
  });
});

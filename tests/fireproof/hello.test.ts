
import { assert, equals, resetDirectory, dataDir } from "./helpers.js";
import { fireproof as database, Database, DbResponse, DocWithId, index, Index, IndexRows } from "../../src/index.js";

describe("Hello World Test", function () {
  it("should pass the hello world test", function () {
    const result = database("hello"); // call to your library function
    assert(result.name === "hello");
  });
});

describe("public API", function () {
  interface TestDoc { foo: string }
  let db: Database
  let idx: Index<string, TestDoc>
  let ok: DbResponse
  let doc: DocWithId<TestDoc>
  let query: IndexRows<string, TestDoc>;
  beforeEach(async function () {
    await resetDirectory(dataDir, "test-public-api");
    db = database("test-public-api");
    idx = index<string, TestDoc>(db, "test-index", (doc) => doc.foo);
    ok = await db.put({ _id: "test", foo: "bar" });
    doc = await db.get("test");
    query = await idx.query();
  });
  it("should have a database", function () {
    assert(db);
    assert(db instanceof Database);
  });
  it("should have an index", function () {
    assert(idx);
    assert(idx instanceof Index);
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
    equals(query.rows[0].id, "bar");
  });
});

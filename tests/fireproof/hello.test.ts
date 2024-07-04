import { rt, fireproof as database, Database, DbResponse, DocWithId, index, Index, IndexRows } from "@fireproof/core";

describe("Hello World Test", function () {
  it("should pass the hello world test", function () {
    const result = database("hello"); // call to your library function
    expect(result.name).toBe("hello");
  });
});

describe("public API", function () {
  interface TestDoc {
    foo: string;
  }
  let db: Database;
  let idx: Index<string, TestDoc>;
  let ok: DbResponse;
  let doc: DocWithId<TestDoc>;
  let query: IndexRows<string, TestDoc>;
  afterEach(async function () {
    await db.close();
    await db.destroy();
  });
  beforeEach(async function () {
    await rt.SysContainer.start();
    db = database("test-public-api");
    idx = index<string, TestDoc>(db, "test-index", (doc) => doc.foo);
    ok = await db.put({ _id: "test", foo: "bar" });
    doc = await db.get("test");
    query = await idx.query();
  });
  it("should have a database", function () {
    expect(db).toBeTruthy();
    expect(db instanceof Database).toBeTruthy();
  });
  it("should have an index", function () {
    expect(idx).toBeTruthy();
    expect(idx instanceof Index).toBeTruthy();
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

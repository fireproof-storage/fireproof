import { fireproof as database, Database, DocResponse, DocWithId, index, Index, IndexRows } from "@fireproof/core";
import { mockSuperThis } from "../helpers";

describe("Hello World Test", function () {
  it("should pass the hello world test", function () {
    const result = database("hello"); // call to your library function
    expect(result.name).toBe("hello");
  });
});

describe("hello public API", function () {
  interface TestDoc {
    foo: string;
  }
  let db: Database;
  let idx: Index<string, TestDoc>;
  let ok: DocResponse;
  let doc: DocWithId<TestDoc>;
  let query: IndexRows<string, TestDoc>;
  const sthis = mockSuperThis();
  afterEach(async function () {
    await db.close();
    await db.destroy();
    await idx.close();
    await idx.destroy();
  });
  beforeEach(async function () {
    await sthis.start();
    db = database("test-public-api");
    idx = index<string, TestDoc>(sthis, db, "test-index", (doc) => doc.foo);
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
  it('should get when you open it again', async function () {
    await db.close();
    await db.destroy();
    const db2 = database("test-public-api");
    doc = await db2.get("test");
    expect(doc.foo).toBe("bar");
  });
});

import { fireproof, Ledger, DocResponse, DocWithId, index, isLedger } from "@fireproof/core";
import { mockSuperThis } from "../helpers.js";

describe("Hello World Test", function () {
  it("should pass the hello world test", function () {
    const result = fireproof("hello"); // call to your library function
    expect(result.name).toBe("hello");
  });
});

describe("hello public API", () => {
  interface TestDoc {
    foo: string;
  }
  let db: Ledger;
  let ok: DocResponse;
  let doc: DocWithId<TestDoc>;
  // let idx: Index<string, TestDoc>;
  const sthis = mockSuperThis();
  afterEach(async () => {
    await db.close();
    await db.destroy();
  });
  beforeEach(async () => {
    await sthis.start();
    db = fireproof("test-public-api");
    index<string, TestDoc>(db, "test-index", (doc) => doc.foo);
    ok = await db.put({ _id: "test", foo: "bar" });
    doc = await db.get("test");
  });
  it("should have a ledger", function () {
    expect(db).toBeTruthy();
    expect(isLedger(db)).toBeTruthy();
  });
  it("should put", function () {
    expect(ok).toBeTruthy();
    expect(ok.id).toBe("test");
  });
  it("should get", function () {
    expect(doc.foo).toBe("bar");
  });
  it("should get when you open it again", async () => {
    await db.close();
    db = fireproof("test-public-api");
    doc = await db.get("test");
    expect(doc.foo).toBe("bar");
  });
});

describe("Simplified Reopening a ledger", function () {
  let db: Ledger;
  afterEach(async function () {
    await db.close();
    await db.destroy();
  });
  beforeEach(async function () {
    db = fireproof("test-reopen-simple");
    const ok = await db.put({ _id: "test", foo: "bar" });
    expect(ok).toBeTruthy();
    expect(ok.id).toBe("test");
  });

  it("should persist data", async function () {
    const doc = await db.get<{ foo: string }>("test");
    expect(doc.foo).toBe("bar");
  });

  it("should have the same data on reopen", async function () {
    const db2 = fireproof("test-reopen-simple");
    const doc = await db2.get<{ foo: string }>("test");
    expect(doc.foo).toBe("bar");
    await db2.close();
  });
});

import { fireproof as database, Database, DocResponse, DocWithId, bs } from "@fireproof/core";
import { URI } from "@adviser/cement";

// @ts-expect-error - This import has no type definitions
import { fileContent } from "./cars/bafkreidxwt2nhvbl4fnqfw3ctlt6zbrir4kqwmjo5im6rf4q5si27kgo2i.js";

describe("Hello World Test", function () {
  it("should pass the hello world test", function () {
    const result = database("hello"); // call to your library function
    expect(result.name).toBe("hello");
  });
});

function customExpect(value: unknown, matcher: (val: unknown) => void, message: string): void {
  try {
    matcher(value);
  } catch (error) {
    void error;
    // console.error(error);
    throw new Error(message);
  }
}

interface ExtendedGateway extends bs.Gateway {
  logger: { _attributes: { module: string; url?: string } };
  headerSize: number;
  fidLength: number;
}

interface ExtendedStore {
  gateway: ExtendedGateway;
  _url: URI;
  name: string;
}

describe("hello public API", function () {
  interface TestDoc {
    foo: string;
  }
  let db: Database;
  let ok: DocResponse;
  let doc: DocWithId<TestDoc>;
  afterEach(async function () {
    await db.close();
    await db.destroy();
  });
  beforeEach(async function () {
    db = database("test-public-api");
    ok = await db.put({ _id: "test", foo: "bar" });
    doc = await db.get("test");
  });
  it("should have a database", function () {
    expect(db).toBeTruthy();
    expect(db instanceof Database).toBeTruthy();
  });
  it("should put", function () {
    expect(ok).toBeTruthy();
    expect(ok.id).toBe("test");
  });
  it("should get", function () {
    expect(doc.foo).toBe("bar");
  });
  it("should get when you open it again", async function () {
    await db.close();
    await db.destroy();
    const db2 = database("test-public-api");
    doc = await db2.get("test");
    expect(doc.foo).toBe("bar");
  });
});

describe("Simplified Reopening a database", function () {
  let db: Database;
  afterEach(async function () {
    await db.close();
    await db.destroy();
  });
  beforeEach(async function () {
    db = new Database("test-reopen-simple");
    const ok = await db.put({ _id: "test", foo: "bar" });
    expect(ok).toBeTruthy();
    expect(ok.id).toBe("test");
  });

  it("should persist data", async function () {
    const doc = await db.get<{ foo: string }>("test");
    expect(doc.foo).toBe("bar");
  });

  it("should have the same data on reopen", async function () {
    const db2 = new Database("test-reopen-simple");
    const doc = await db2.get<{ foo: string }>("test");
    expect(doc.foo).toBe("bar");
    await db2.close();
  });
});

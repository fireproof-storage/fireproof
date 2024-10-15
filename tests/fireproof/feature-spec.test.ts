import { mockSuperThis } from "../helpers.js";
import { CID } from "multiformats/cid";

import { Database, DatabaseFactory, DocResponse, DocWithId, IndexRows, bs, fireproof, index, isDatabase } from "@fireproof/core";

export function carLogIncludesGroup(list: bs.AnyLink[], cid: CID) {
  return list.some((c) => c.equals(cid));
}

interface FooType {
  readonly foo: string;
}

describe("public API", function () {
  interface Doc {
    foo: string;
  }
  let db: Database;
  let ok: DocResponse;
  let doc: DocWithId<Doc>;
  let query: IndexRows<string, Doc>;
  const sthis = mockSuperThis();

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
  it("should be a database instance", function () {
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

describe("basic database", function () {
  interface Doc {
    foo: string;
  }
  let db: Database<Doc>;
  const sthis = mockSuperThis();
  afterEach(async function () {
    await db.close();
    await db.destroy();
  });
  beforeEach(async function () {
    await sthis.start();
    db = DatabaseFactory("test-basic");
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
});

describe("Reopening a database", function () {
  interface Doc {
    foo: string;
  }
  let db: Database;
  const sthis = mockSuperThis();
  afterEach(async function () {
    await db.close().catch(() => true);
    await db.destroy();
  });
  beforeEach(async function () {
    // erase the existing test data
    await sthis.start();

    db = DatabaseFactory("test-reopen-spec", { autoCompact: 100000 });
    const ok = await db.put({ _id: "test", foo: "bar" });
    expect(ok).toBeTruthy();
    expect(ok.id).toBe("test");
  });

  it("should persist data", async function () {
    const doc = await db.get<Doc>("test");
    expect(doc.foo).toBe("bar");
  });

  it("should have the same data on reopen", async function () {
    await db.close();
    const db2 = DatabaseFactory("test-reopen-spec");
    const doc = await db2.get<FooType>("test");
    expect(doc.foo).toBe("bar");
    await db2.close();
  });
});

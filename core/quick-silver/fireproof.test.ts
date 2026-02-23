import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { fireproof } from "./fireproof.js";
import { Database } from "@fireproof/core-types-base";
import { isQSDocMeta, isQSFileMeta } from "./envelope.js";
import { ensureSuperThis } from "@fireproof/core-runtime";

describe("quick-silver", () => {
  const sthis = ensureSuperThis();
  it("one instance per dbname", () => {
    const db1 = fireproof("db");
    const db2 = fireproof("db");
    expect(db1).toBe(db2);
  });

  describe("bulk", () => {
    let db: Database;
    beforeEach(() => {
      db = fireproof("bulk-test");
    });
    afterEach(async () => {
      await db.destroy();
    });

    it("should bulk insert docs", async () => {
      const result = await db.bulk([
        { withoutKey: "xxxx" },
        { _id: "setkey", setKey: "key" },
        { _files: { myfile: new File(["i don't know"], "test.txt") }, files: "dings" },
      ]);
      expect(result.ids).toHaveLength(3);
      expect(result.ids[1]).toBe("setkey");
    });

    it("file _ has cid matching content hash and get resolves docFile", async () => {
      const file = new File(["hello file"], "hello.txt");

      const result = await db.bulk([{ _id: "file-doc", _files: { hello: file }, label: "test" }]);
      expect(result.ids[0]).toBe("file-doc");

      const doc = await db.get<{ label: string }>("file-doc");
      const fileMetas = (doc._meta ?? []).filter(isQSFileMeta);
      expect(fileMetas).toHaveLength(1);
      expect(fileMetas[0].payload.filename).toBe("hello.txt");
      expect(fileMetas[0].key).toBeTruthy();
      expect(doc._files?.["hello.txt"]).toBeInstanceOf(File);
    });
  });

  describe("put", () => {
    let db: Database;
    beforeEach(() => {
      db = fireproof("put-test");
    });
    afterEach(async () => {
      await db.destroy();
    });

    it("should put and get a doc", async () => {
      const ok = await db.put({ _id: "puttest", foo: "baz" });
      expect(ok.id).toBe("puttest");
      const doc = await db.get<{ foo: string }>("puttest");
      expect(doc.foo).toBe("baz");
    });

    it("should auto-generate an id", async () => {
      const ok = await db.put({ bar: 42 });
      expect(ok.id).toBeTruthy();
      const doc = await db.get<{ bar: number }>(ok.id);
      expect(doc.bar).toBe(42);
    });
  });

  describe("subscribe", () => {
    let db: Database;
    beforeEach(() => {
      db = fireproof("subscribe-test");
    });
    afterEach(async () => {
      await db.destroy();
    });

    it("should notify subscriber with docs on put", async () => {
      const received: unknown[] = [];
      db.subscribe((docs) => {
        received.push(...docs);
      });
      await db.put({ _id: "sub1", val: 1 });
      expect(received).toHaveLength(1);
      expect((received[0] as { _id: string })._id).toBe("sub1");
    });

    it("should notify no-update subscriber without docs", async () => {
      let called = 0;
      db.subscribe(() => {
        called++;
      }, false);
      await db.put({ _id: "sub2", val: 2 });
      expect(called).toBe(1);
    });

    it("should unsubscribe", async () => {
      let called = 0;
      const unsub = db.subscribe(() => {
        called++;
      }, false);
      unsub();
      await db.put({ _id: "sub3", val: 3 });
      expect(called).toBe(0);
    });
  });

  describe("get", () => {
    let db: Database;
    beforeEach(() => {
      db = fireproof("get-test");
    });
    afterEach(async () => {
      await db.destroy();
    });

    it("should get a doc by id", async () => {
      await db.bulk([{ _id: "gettest", foo: "bar" }]);
      const doc = await db.get<{ foo: string }>("gettest");
      expect(doc._id).toBe("gettest");
      expect(doc.foo).toBe("bar");
    });

    it("should include _ metadata in returned doc", async () => {
      await db.put({ _id: "with-meta", foo: "bar" });
      const doc = await db.get<{ foo: string }>("with-meta");
      expect(doc.foo).toBe("bar");
      const docMeta = (doc._meta ?? []).find(isQSDocMeta);
      expect(docMeta).toBeDefined();
      expect(docMeta?.key).toBe("with-meta");
      expect(docMeta?.payload.cid).toBeTruthy();
      expect((doc._meta ?? []).filter(isQSFileMeta)).toHaveLength(0);
    });

    it("should throw NotFoundError for missing id", async () => {
      await expect(db.get("missing")).rejects.toThrow();
    });
  });

  describe("del", () => {
    let db: Database;
    beforeEach(() => {
      db = fireproof("del-test");
    });
    afterEach(async () => {
      await db.destroy();
    });

    it("should delete a doc", async () => {
      await db.put({ _id: "to-delete", foo: "bar" });
      const ok = await db.del("to-delete");
      expect(ok.id).toBe("to-delete");
      await expect(db.get("to-delete")).rejects.toThrow();
    });

    it("remove should be an alias for del", async () => {
      await db.put({ _id: "to-remove", foo: "bar" });
      const ok = await db.remove("to-remove");
      expect(ok.id).toBe("to-remove");
    });
  });

  describe("destroy", () => {
    it("clears all docs — get throws after destroy", async () => {
      const db = fireproof("destroy-test");
      await db.put({ _id: "survivor", x: 1 });
      await db.destroy();

      const db2 = fireproof("destroy-test");
      await expect(db2.get("survivor")).rejects.toThrow();
      await db2.destroy();
    });

    it("allDocs returns empty after destroy", async () => {
      const dbName = `destroy-alldocs-test-${sthis.nextId().str}`;
      const db = fireproof(dbName);
      await db.bulk([{ _id: "a" }, { _id: "b" }]);
      await db.destroy();

      const db2 = fireproof(dbName);
      const result = await db2.allDocs();
      expect(result.rows).toHaveLength(0);
      await db2.destroy();
    });
  });

  describe("allDocs", () => {
    let db: Database;
    beforeEach(() => {
      db = fireproof("alldocs-test");
    });
    afterEach(async () => {
      await db.destroy();
    });

    it("returns all docs", async () => {
      await db.bulk([
        { _id: "a", x: 1 },
        { _id: "b", x: 2 },
        { _id: "c", x: 3 },
      ]);
      const result = await db.allDocs<{ x: number }>();
      expect(result.rows).toHaveLength(3);
      const keys = result.rows.map((r) => r.key).sort();
      expect(keys).toEqual(["a", "b", "c"]);
      expect(result.rows.find((r) => r.key === "b")?.value.x).toBe(2);
    });

    it("filters by keys", async () => {
      await db.bulk([
        { _id: "a", x: 1 },
        { _id: "b", x: 2 },
        { _id: "c", x: 3 },
      ]);
      const result = await db.allDocs<{ x: number }>({ keys: ["a", "c"] });
      expect(result.rows).toHaveLength(2);
      expect(result.rows.map((r) => r.key).sort()).toEqual(["a", "c"]);
    });

    it("excludes deleted docs by default", async () => {
      await db.bulk([
        { _id: "x", v: 1 },
        { _id: "y", v: 2 },
      ]);
      await db.del("x");
      const result = await db.allDocs();
      expect(result.rows.map((r) => r.key)).not.toContain("x");
      expect(result.rows.map((r) => r.key)).toContain("y");
    });

    it("allDocuments is an alias for allDocs", async () => {
      await db.put({ _id: "z", v: 1 });
      const r1 = await db.allDocs();
      const r2 = await db.allDocuments();
      expect(r1.rows.map((r) => r.key)).toEqual(r2.rows.map((r) => r.key));
    });
  });

  describe("query", () => {
    let db: Database;
    beforeEach(async () => {
      db = fireproof("query-test");
      await db.bulk([
        { _id: "a", score: 3, tag: "x" },
        { _id: "b", score: 1, tag: "y" },
        { _id: "c", score: 2, tag: "x" },
        { _id: "d", score: 4, tag: "z" },
      ]);
    });
    afterEach(async () => {
      await db.destroy();
    });

    it("field string — rows keyed by that field, sorted asc", async () => {
      const r = await db.query<{ score: number; tag: string }, number>("score");
      expect(r.rows.map((row) => row.key)).toEqual([1, 2, 3, 4]);
      expect(r.rows.map((row) => row.id)).toEqual(["b", "c", "a", "d"]);
    });

    it("field string — descending", async () => {
      const r = await db.query<{ score: number }, number>("score", { descending: true });
      expect(r.rows.map((row) => row.key)).toEqual([4, 3, 2, 1]);
    });

    it("field string — limit", async () => {
      const r = await db.query<{ score: number }, number>("score", { limit: 2 });
      expect(r.rows).toHaveLength(2);
      expect(r.rows.map((row) => row.key)).toEqual([1, 2]);
    });

    it("field string — key filter", async () => {
      const r = await db.query<{ score: number }, number>("score", { key: 2 });
      expect(r.rows).toHaveLength(1);
      expect(r.rows[0].id).toBe("c");
    });

    it("field string — keys filter", async () => {
      const r = await db.query<{ score: number }, number>("score", { keys: [1, 3] });
      expect(r.rows.map((row) => row.key).sort()).toEqual([1, 3]);
    });

    it("field string — range filter (inclusive)", async () => {
      const r = await db.query<{ score: number }, number>("score", { range: [2, 3] });
      expect(r.rows.map((row) => row.key)).toEqual([2, 3]);
    });

    it("MapFn — emit per doc", async () => {
      const r = await db.query<{ tag: string }, string>((doc, emit) => {
        emit(doc.tag);
      });
      expect(r.rows.map((row) => row.key).sort()).toEqual(["x", "x", "y", "z"]);
    });

    it("MapFn — emit per return", async () => {
      const r = await db.query<{ tag: string }, string>((doc, _emit) => {
        return doc.tag;
      });
      expect(r.rows.map((row) => row.key).sort()).toEqual(["x", "x", "y", "z"]);
    });

    it("MapFn — multi-emit per doc (one row per emit)", async () => {
      const r = await db.query<{ score: number; tag: string }, string>((doc, emit) => {
        emit(doc.tag, doc.score);
        emit(`score:${doc.score}`);
      });
      expect(r.rows).toHaveLength(8); // 4 docs × 2 emits each
    });

    it("includeDocs: false — no doc on rows", async () => {
      const r = await db.query("score", { includeDocs: false });
      expect(r.rows.every((row) => row.doc === undefined)).toBe(true);
    });

    it("docs array present when includeDocs is not false", async () => {
      const r = (await db.query("score")) as { rows: unknown[]; docs: unknown[] };
      expect(r.docs).toHaveLength(4);
    });

    it("skips docs without the queried field", async () => {
      await db.put({ _id: "no-score", tag: "x" });
      const r = await db.query("score");
      expect(r.rows.map((row) => row.id)).not.toContain("no-score");
      await db.del("no-score");
    });
  });

  describe("close", () => {
    it("should invoke onClosed listeners", async () => {
      const db = fireproof("close-test");
      let called = 0;
      db.onClosed(() => {
        called++;
      });
      await db.close();
      expect(called).toBe(1);
    });
  });
});

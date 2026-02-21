import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { fireproof } from "./fireproof.js";
import { Database } from "@fireproof/core-types-base";

describe("quick-silver", () => {
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

    it("should throw NotFoundError for missing id", async () => {
      await expect(db.get("missing")).rejects.toThrow();
    });
  });
});

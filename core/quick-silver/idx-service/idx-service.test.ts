import { describe, it, expect } from "vitest";
import { consumeStream } from "@adviser/cement";
import { ensureSuperThis } from "@fireproof/core-runtime";
import { IdxService } from "./service.js";
import type { IdxEntry } from "./types.js";

const sthis = ensureSuperThis();

async function drain(stream: ReadableStream<IdxEntry>): Promise<IdxEntry[]> {
  return consumeStream(stream, (e: IdxEntry) => e);
}

// One service instance per suite; each test gets its own dbname to stay isolated.
const svc = IdxService({ prefix: `test-${sthis.nextId(8).str}-` });
const idxName = "byTitle";

function db(): string {
  return `db-${sthis.nextId(8).str}`;
}

describe("IdxService / addToIdx + query", () => {
  it("stores an entry and query returns it", async () => {
    const dbname = db();
    const r = await svc.addToIdx({ dbname, idxName, keys: ["apple"] });
    expect(r.isErr()).toBe(false);

    const qr = await svc.query({ dbname, idxName });
    expect(qr.isErr()).toBe(false);
    const entries = await drain(qr.Ok());
    expect(entries).toHaveLength(1);
    expect(entries[0].keys[0]).toBe("apple");
  });

  it("returns entries in ascending order by default", async () => {
    const dbname = db();
    await svc.addToIdx({ dbname, idxName, keys: ["cherry"] });
    await svc.addToIdx({ dbname, idxName, keys: ["apple"] });
    await svc.addToIdx({ dbname, idxName, keys: ["banana"] });

    const qr = await svc.query({ dbname, idxName, order: "asc" });
    const entries = await drain(qr.Ok());
    expect(entries.map((e) => e.keys[0])).toEqual(["apple", "banana", "cherry"]);
  });

  it("returns entries in descending order", async () => {
    const dbname = db();
    await svc.addToIdx({ dbname, idxName, keys: ["cherry"] });
    await svc.addToIdx({ dbname, idxName, keys: ["apple"] });
    await svc.addToIdx({ dbname, idxName, keys: ["banana"] });

    const qr = await svc.query({ dbname, idxName, order: "desc" });
    const entries = await drain(qr.Ok());
    expect(entries.map((e) => e.keys[0])).toEqual(["cherry", "banana", "apple"]);
  });

  it("filters by specific keys", async () => {
    const dbname = db();
    await svc.addToIdx({ dbname, idxName, keys: ["x"] });
    await svc.addToIdx({ dbname, idxName, keys: ["y"] });
    await svc.addToIdx({ dbname, idxName, keys: ["z"] });

    const qr = await svc.query({ dbname, idxName, keys: ["x", "z"] });
    const entries = await drain(qr.Ok());
    expect(entries.map((e) => e.keys[0]).sort()).toEqual(["x", "z"]);
  });

  it("select filters entries at cursor level", async () => {
    const dbname = db();
    await svc.addToIdx({ dbname, idxName, keys: ["aaa"], meta: [{ type: "t", key: "v", payload: 1 }] });
    await svc.addToIdx({ dbname, idxName, keys: ["bbb"], meta: [{ type: "t", key: "v", payload: 2 }] });
    await svc.addToIdx({ dbname, idxName, keys: ["ccc"], meta: [{ type: "t", key: "v", payload: 3 }] });

    const qr = await svc.query({
      dbname,
      idxName,
      select: (r) => ((r.meta?.find((m) => m.type === "t" && m.key === "v")?.payload as number) ?? 0) > 1,
    });
    const entries = await drain(qr.Ok());
    expect(entries.map((e) => e.keys[0])).toEqual(["bbb", "ccc"]);
  });
});

describe("IdxService / meta merging", () => {
  it("merges meta — existing entries not in incoming are kept", async () => {
    const dbname = db();
    await svc.addToIdx({ dbname, idxName, keys: ["k"], meta: [{ type: "tag", key: "color", payload: "yellow" }] });
    const r2 = await svc.addToIdx({ dbname, idxName, keys: ["k"], meta: [{ type: "tag", key: "size", payload: "large" }] });
    expect(r2.isErr()).toBe(false);
    const r2Meta = r2.Ok().meta ?? [];
    expect(r2Meta.find((m) => m.key === "color")?.payload).toBe("yellow");
    expect(r2Meta.find((m) => m.key === "size")?.payload).toBe("large");

    const qr = await svc.query({ dbname, idxName });
    const [entry] = await drain(qr.Ok());
    const meta = entry.meta ?? [];
    expect(meta.find((m) => m.key === "color")?.payload).toBe("yellow");
    expect(meta.find((m) => m.key === "size")?.payload).toBe("large");
  });

  it("incoming wins on type+key collision", async () => {
    const dbname = db();
    await svc.addToIdx({ dbname, idxName, keys: ["k"], meta: [{ type: "tag", key: "color", payload: "yellow" }] });
    const r2 = await svc.addToIdx({ dbname, idxName, keys: ["k"], meta: [{ type: "tag", key: "color", payload: "green" }] });
    expect(r2.isErr()).toBe(false);
    const colorTag = (r2.Ok().meta ?? []).find((m) => m.type === "tag" && m.key === "color");
    expect(colorTag?.payload).toBe("green");

    const qr = await svc.query({ dbname, idxName });
    const [entry] = await drain(qr.Ok());
    const queriedColorTag = (entry.meta ?? []).find((m) => m.type === "tag" && m.key === "color");
    expect(queriedColorTag?.payload).toBe("green");
  });
});

describe("IdxService / soft delete", () => {
  it("deleteFromIdx excludes entry from query by default", async () => {
    const dbname = db();
    await svc.addToIdx({ dbname, idxName, keys: ["fig"] });
    const dr = await svc.deleteFromIdx({ dbname, idxName, keys: ["fig"] });
    expect(dr.isErr()).toBe(false);

    const qr = await svc.query({ dbname, idxName });
    const entries = await drain(qr.Ok());
    expect(entries.find((e) => e.keys[0] === "fig")).toBeUndefined();
  });

  it("includeDeleted: true emits the deleted entry with deleted=true", async () => {
    const dbname = db();
    await svc.addToIdx({ dbname, idxName, keys: ["grape"] });
    await svc.deleteFromIdx({ dbname, idxName, keys: ["grape"] });

    const qr = await svc.query({ dbname, idxName, includeDeleted: true });
    const entries = await drain(qr.Ok());
    const grape = entries.find((e) => e.keys[0] === "grape");
    expect(grape?.deleted).toBe(true);
  });

  it("addToIdx resets the deleted marker so entry reappears", async () => {
    const dbname = db();
    await svc.addToIdx({ dbname, idxName, keys: ["mango"] });
    await svc.deleteFromIdx({ dbname, idxName, keys: ["mango"] });
    await svc.addToIdx({ dbname, idxName, keys: ["mango"] });

    const qr = await svc.query({ dbname, idxName });
    const entries = await drain(qr.Ok());
    expect(entries.find((e) => e.keys[0] === "mango")).toBeDefined();
  });

  it("deleteFromIdx is a no-op for an unknown entry", async () => {
    const dbname = db();
    const r = await svc.deleteFromIdx({ dbname, idxName, keys: ["ghost"] });
    expect(r.isErr()).toBe(false);
  });
});

import { describe, it, expect, afterEach } from "vitest";
import { fireproof } from "@fireproof/core-base";
import type { Database } from "@fireproof/core-types-base";

describe("Uint8Array document field round-trip", () => {
  let db: Database;

  afterEach(async () => {
    await db.close();
    await db.destroy();
  });

  it("preserves an empty Uint8Array", async () => {
    db = fireproof(`u8rt-empty-${Date.now()}`);
    const data = new Uint8Array(0);
    const { id } = await db.put({ type: "bin", payload: data });
    const doc = await db.get<{ type: string; payload: Uint8Array }>(id);
    expect(doc.payload).toBeInstanceOf(Uint8Array);
    expect(doc.payload.length).toBe(0);
  });

  it("preserves a small Uint8Array", async () => {
    db = fireproof(`u8rt-small-${Date.now()}`);
    const data = new Uint8Array([1, 2, 3, 255, 0, 128]);
    const { id } = await db.put({ type: "bin", payload: data });
    const doc = await db.get<{ type: string; payload: Uint8Array }>(id);
    expect(doc.payload).toBeInstanceOf(Uint8Array);
    expect(new Uint8Array(doc.payload)).toEqual(data);
  });

  it("preserves a 256-byte Uint8Array", async () => {
    db = fireproof(`u8rt-256-${Date.now()}`);
    const data = new Uint8Array(256);
    for (let i = 0; i < 256; i++) data[i] = i;
    const { id } = await db.put({ type: "bin", payload: data });
    const doc = await db.get<{ type: string; payload: Uint8Array }>(id);
    expect(doc.payload).toBeInstanceOf(Uint8Array);
    expect(new Uint8Array(doc.payload)).toEqual(data);
  });

  it("preserves Uint8Array nested inside an object", async () => {
    db = fireproof(`u8rt-nested-${Date.now()}`);
    const data = new Uint8Array([10, 20, 30]);
    const { id } = await db.put({ type: "nested", inner: { label: "test", data } });
    const doc = await db.get<{ type: string; inner: { label: string; data: Uint8Array } }>(id);
    expect(doc.inner.data).toBeInstanceOf(Uint8Array);
    expect(new Uint8Array(doc.inner.data)).toEqual(data);
    expect(doc.inner.label).toBe("test");
  });

  it("preserves Uint8Array inside an array", async () => {
    db = fireproof(`u8rt-array-${Date.now()}`);
    const a = new Uint8Array([1, 2]);
    const b = new Uint8Array([3, 4]);
    const { id } = await db.put({ type: "arr", items: [{ data: a }, { data: b }] });
    const doc = await db.get<{ type: string; items: Array<{ data: Uint8Array }> }>(id);
    expect(doc.items[0].data).toBeInstanceOf(Uint8Array);
    expect(doc.items[1].data).toBeInstanceOf(Uint8Array);
    expect(new Uint8Array(doc.items[0].data)).toEqual(a);
    expect(new Uint8Array(doc.items[1].data)).toEqual(b);
  });

  it("preserves multiple Uint8Array fields in one document", async () => {
    db = fireproof(`u8rt-multi-${Date.now()}`);
    const key = new Uint8Array([0xde, 0xad]);
    const value = new Uint8Array([0xbe, 0xef]);
    const { id } = await db.put({ type: "multi", key, value });
    const doc = await db.get<{ type: string; key: Uint8Array; value: Uint8Array }>(id);
    expect(doc.key).toBeInstanceOf(Uint8Array);
    expect(doc.value).toBeInstanceOf(Uint8Array);
    expect(new Uint8Array(doc.key)).toEqual(key);
    expect(new Uint8Array(doc.value)).toEqual(value);
  });
});

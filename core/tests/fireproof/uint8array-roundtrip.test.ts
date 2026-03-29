import { describe, it, expect, afterEach } from "vitest";
import { fireproof } from "@fireproof/core-base";
import type { Database } from "@fireproof/core-types-base";

describe("Uint8Array document field round-trip", () => {
  let db: Database;

  afterEach(async () => {
    await db.close();
    await db.destroy();
  });

  it("preserves Uint8Array through put/get", async () => {
    db = fireproof(`u8rt-basic-${Date.now()}`);
    const data = new Uint8Array([1, 2, 3, 255, 0, 128]);
    const { id } = await db.put({ type: "bin", payload: data });
    const doc = await db.get<{ type: string; payload: Uint8Array }>(id);
    expect(doc.payload).toBeInstanceOf(Uint8Array);
    expect(new Uint8Array(doc.payload)).toEqual(data);
  });

  it("preserves Uint8Array nested inside an object", async () => {
    // Without the fix, sanitizeDocumentFields iterates Uint8Array numeric keys
    // and produces a plain object like {0: 10, 1: 20, 2: 30}
    db = fireproof(`u8rt-nested-${Date.now()}`);
    const data = new Uint8Array([10, 20, 30]);
    const { id } = await db.put({ type: "nested", inner: { label: "test", data } });
    const doc = await db.get<{ type: string; inner: { label: string; data: Uint8Array } }>(id);
    expect(doc.inner.data).toBeInstanceOf(Uint8Array);
    expect(new Uint8Array(doc.inner.data)).toEqual(data);
    expect(doc.inner.label).toBe("test");
  });
});

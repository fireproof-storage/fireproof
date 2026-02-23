import { describe, it, expect } from "vitest";
import { CIDStorageService } from "./service.js";
import { DexieStorageBackendImpl } from "./dexie.js";
import { OPFSStorageBackendImpl } from "./opfs.js";
import { consumeStream } from "@adviser/cement";
import { ensureSuperThis } from "@fireproof/core-runtime";

const sthis = ensureSuperThis();

function streamFrom(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(ctrl) {
      ctrl.enqueue(bytes);
      ctrl.close();
    },
  });
}

async function drainStream(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks = await consumeStream(stream, (c: Uint8Array) => c);
  const total = chunks.reduce((s, c) => s + c.byteLength, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

const backends = [
  { name: "dexie", make: () => new DexieStorageBackendImpl("cid-test-dexie") },
  { name: "opfs", make: () => new OPFSStorageBackendImpl("cid-test-opfs", sthis) },
];

describe.each(backends)("CIDStorageService / $name", ({ make }) => {
  const svc = CIDStorageService({ backends: [make()] });

  it("store returns cid, size, and a url", async () => {
    const bytes = sthis.txt.encode("hello cid storage");
    const result = await svc.store(streamFrom(bytes));
    expect(result.isErr()).toBe(false);
    const r = result.Ok();
    expect(r.cid).toBeTruthy();
    expect(r.size).toBe(bytes.byteLength);
    expect(r.url).toContain(r.cid);
    expect(r.created).toBeInstanceOf(Date);
  });

  it("get returns the stored bytes via the url", async () => {
    const bytes = sthis.txt.encode("round trip content");
    const storeResult = await svc.store(streamFrom(bytes));
    expect(storeResult.isErr()).toBe(false);
    const { url } = storeResult.Ok();

    const getResult = await svc.get(url);
    expect(getResult.isErr()).toBe(false);
    const found = getResult.Ok();
    expect(found.found).toBe(true);
    if (!found.found) return;

    const received = await drainStream(found.stream);
    expect(received).toEqual(bytes);
    expect(found.size).toBe(bytes.byteLength);
  });

  it("get returns found=false for unknown url", async () => {
    const result = await svc.get(`${make().name}://?cid=badfakecid123`);
    expect(result.isErr()).toBe(false);
    expect(result.Ok().found).toBe(false);
  });

  it("storing same bytes twice yields the same cid", async () => {
    const bytes = sthis.txt.encode("idempotent content");
    const first = await svc.store(streamFrom(bytes));
    const second = await svc.store(streamFrom(bytes));
    expect(first.Ok().cid).toBe(second.Ok().cid);
  });

  it("cid is deterministic — same content always yields same cid", async () => {
    const bytes = sthis.txt.encode("deterministic content");
    const r1 = await svc.store(streamFrom(bytes));
    const r2 = await svc.store(streamFrom(bytes));
    expect(r1.Ok().cid).toBe(r2.Ok().cid);
  });
});

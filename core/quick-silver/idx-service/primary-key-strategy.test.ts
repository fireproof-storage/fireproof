import { describe, it, expect } from "vitest";
import { ensureSuperThis } from "@fireproof/core-runtime";
import { PrimaryKeyStrategy } from "./primary-key-strategy.js";
import { IdxService } from "./service.js";
import { isQSDeviceMeta, QSDocMeta, QSFileMeta } from "../envelope.js";
import { consumeStream } from "@adviser/cement";
import { IdxEntry } from "./types.js";

const sthis = ensureSuperThis();
const svc = IdxService({ prefix: `test-${sthis.nextId(8).str}-` });

describe("PrimaryKeyStrategy", () => {
  it("lazily resolves device fingerprint", async () => {
    const strategy = new PrimaryKeyStrategy({ sthis });
    const fp = await strategy.deviceFingerPrint();
    expect(fp).toBeTruthy();
    expect(typeof fp).toBe("string");
  });

  it("write: _id gets all meta, _cid gets one entry per CID with device meta", async () => {
    const dbname = `db-${sthis.nextId(8).str}`;
    const strategy = new PrimaryKeyStrategy({ sthis, idxService: svc });
    const deviceId = await strategy.deviceFingerPrint();

    const docMeta: QSDocMeta = {
      type: "qs.doc.meta",
      key: "doc-1",
      payload: {
        idxName: "_id",
        cid: "bafydoc111",
        url: "x://?cid=bafydoc111",
        primaryKey: "doc-1",
        created: new Date().toISOString(),
      },
    };
    const fileMeta1: QSFileMeta = {
      type: "qs.file.meta",
      key: "file-1",
      payload: {
        idxName: "_id",
        cid: "bafyfile111",
        url: "x://?cid=bafyfile111",
        filename: "photo.jpg",
        size: 1024,
        created: new Date().toISOString(),
      },
    };
    const fileMeta2: QSFileMeta = {
      type: "qs.file.meta",
      key: "file-2",
      payload: {
        idxName: "_id",
        cid: "bafyfile222",
        url: "x://?cid=bafyfile222",
        filename: "thumb.jpg",
        size: 256,
        created: new Date().toISOString(),
      },
    };

    const r = await svc.transaction(dbname, (tx) =>
      strategy.write(tx, { dbname, idxName: "_id", keys: ["doc-1"], meta: [docMeta, fileMeta1, fileMeta2] }, "doc-1"),
    );
    expect(r.isErr()).toBe(false);

    // _id: exactly one qs.doc.meta and two qs.file.meta
    const idQr = await svc.query({ dbname, idxName: "_id" });
    expect(idQr.isErr()).toBe(false);
    const idReader = idQr.Ok().getReader();
    const { value: idEntry } = await idReader.read();
    idReader.releaseLock();
    expect(idEntry?.keys[0]).toBe("doc-1");

    const idDocMetas = idEntry?.meta?.filter((m) => m.type === "qs.doc.meta") ?? [];
    expect(idDocMetas).toHaveLength(1);
    expect((idDocMetas[0].payload as QSDocMeta["payload"]).cid).toBe("bafydoc111");
    expect((idDocMetas[0].payload as QSDocMeta["payload"]).url).toBe("x://?cid=bafydoc111");

    const idFileMetas = idEntry?.meta?.filter((m) => m.type === "qs.file.meta") ?? [];
    expect(idFileMetas).toHaveLength(2);
    expect((idFileMetas[0].payload as QSFileMeta["payload"]).cid).toBe("bafyfile111");
    expect((idFileMetas[1].payload as QSFileMeta["payload"]).cid).toBe("bafyfile222");

    // _cid: one entry per CID, each with its source meta + one qs.device.meta keyed by deviceId
    const cidQr = await svc.query({ dbname, idxName: "_cid" });
    expect(cidQr.isErr()).toBe(false);
    const cidEntries = await consumeStream(cidQr.Ok(), (a) => [a.serializedKey, a] as const);
    const byCid = cidEntries.reduce(
      (acc, [key, entry]) => {
        if (!acc[key]) acc[key] = [];
        acc[key].push(entry);
        return acc;
      },
      {} as Record<string, IdxEntry[]>,
    );
    for (const cid of ["bafydoc111", "bafyfile111", "bafyfile222"]) {
      for (const idx of byCid[cid]) {
        const deviceMetas = (idx.meta ?? []).filter(isQSDeviceMeta);
        expect(deviceMetas).toHaveLength(1);
        expect(deviceMetas[0].key).toBe(deviceId);
      }
    }
  });
});

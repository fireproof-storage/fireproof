import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { CidSetService, SyncDatabase } from "@fireproof/core-protocols-sync";
import { ensureSuperThis } from "@fireproof/core-runtime";

describe("CidSetService", () => {
  const sthis = ensureSuperThis();
  const db = new SyncDatabase(sthis, "dexie://test-sync-db");

  beforeEach(async () => {
    await sthis.start();
    await db.ready();
  });

  afterEach(async () => {
    await db.close();
    await db.destroy();
  });

  describe("put", () => {
        it("should create a new cid set", async () => {
      const cidSet = {
          cid: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55f1",
          car: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
          type: "cidSet",
        }

      const result = await CidSetService.put(db, cidSet);

      expect(result.isOk()).toBe(true);
      expect(result.Ok()).toEqual([cidSet]);
    });
    it("should create a new cid sets", async () => {
      const cidSet = [
        {
          cid: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55f1",
          car: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
          type: "cidSet",
        },
        {
          cid: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55f2",
          car: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
          type: "cidSet",
        },
      ];

      const result = await CidSetService.put(db, cidSet);

      expect(result.isOk()).toBe(true);
      expect(result.Ok()).toEqual(cidSet);
    });
  });

  describe("get", () => {
    it("should retrieve existing cid set", async () => {
              const cidSet = [
        {
          cid: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55f1",
          car: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
          type: "cidSet",
        },
        {
          cid: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55f2",
          car: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
          type: "cidSet",
        },
      ];

      await CidSetService.put(db, cidSet);

      const r1 = await CidSetService.get(db, cidSet[0].cid)
      const r2 = await CidSetService.get(db, cidSet[1].cid)

      expect(r1.isOk()).toBe(true);
      expect(r1.Ok()).toEqual(cidSet[0]);
      expect(r2.isOk()).toBe(true);
      expect(r2.Ok()).toEqual(cidSet[1]);

    });

    it("should return undefined for non-existent cid", async () => {
      const result = await CidSetService.get(db, "non-existent-cid");
      expect(result.isOk()).toBe(true);
      expect(result.Ok()).toBeUndefined();
    });
  });
});

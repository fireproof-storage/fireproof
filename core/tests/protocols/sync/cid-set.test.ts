import { describe, it, expect, afterEach, afterAll, beforeAll } from "vitest";
import { CidSetService } from "@fireproof/core-protocols-sync";
import { ensureSuperThis } from "@fireproof/core-runtime";
import { getGatewayFactoryItem, SerdeGatewayFactoryItem } from "@fireproof/core-blockstore";
import { DBTable, FPIndexedDB, CidSet } from "@fireproof/core-types-blockstore";
import { withSuperThis, WithSuperThis } from "@fireproof/core-types-base";
import { URI } from "@adviser/cement";

describe("CidSetService", () => {
  const sthis = ensureSuperThis();
  const backendURI = URI.from(sthis.env.get("FP_STORAGE_URL"));
  let gw: SerdeGatewayFactoryItem;
  let db: WithSuperThis<DBTable<CidSet>>;
  let fpDb: FPIndexedDB;

  beforeAll(async () => {
    await sthis.start();
    gw = getGatewayFactoryItem(backendURI.protocol) as SerdeGatewayFactoryItem;
    fpDb = await gw.fpIndexedDB(sthis, backendURI.build().appendRelative("cid-sets").URI());
    db = withSuperThis(fpDb.fpSync.cidSets(), sthis);
  });
  afterEach(async () => {
    await db.clear();
  });

  afterAll(async () => {
    await fpDb.close();
    await fpDb.destroy();
  });

  describe("put", () => {
    it("should create a new cid set", async () => {
      const cidSet = {
        cid: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55f1",
        car: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
        type: "cidSet",
      };

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

      const r1 = await CidSetService.get(db, cidSet[0].cid);
      const r2 = await CidSetService.get(db, cidSet[1].cid);

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

import { describe, it, expect, afterEach, afterAll, beforeAll } from "vitest";
import { BlockLogService } from "@fireproof/core-protocols-sync";
import { consumeStream, ensureSuperThis } from "@fireproof/core-runtime";
import { BlockLog, DBTable, FPIndexedDB } from "@fireproof/core-types-blockstore";
import { getGatewayFactoryItem, SerdeGatewayFactoryItem } from "@fireproof/core-blockstore";
import { withSuperThis, WithSuperThis } from "@fireproof/core-types-base";
import { URI } from "@adviser/cement";

describe("BlockLogService", () => {
  const sthis = ensureSuperThis();
  const backendURI = URI.from(sthis.env.get("FP_STORAGE_URL"));
  let gw: SerdeGatewayFactoryItem;
  let db: WithSuperThis<DBTable<BlockLog>>;
  let fpDb: FPIndexedDB;

  beforeAll(async () => {
    await sthis.start();
    gw = getGatewayFactoryItem(backendURI.protocol) as SerdeGatewayFactoryItem;
    fpDb = await gw.fpIndexedDB(sthis, backendURI.build().appendRelative("block-logs").URI());
    db = withSuperThis(fpDb.fpSync.blockLogs(), sthis);
  });

  afterEach(async () => {
    await db.clear();
  });

  afterAll(async () => {
    await fpDb.close();
    await fpDb.destroy();
  });

  describe("create", () => {
    it("should auto-generate seq if not provided", async () => {
      const blockLog = {
        car: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
      };

      let lastSeq: string | undefined;
      for (let i = 0; i < 10; i++) {
        const result = await BlockLogService.create(db, blockLog);
        expect(result.isOk()).toBe(true);
        if (lastSeq) {
          expect(lastSeq.localeCompare(result.Ok().seq)).toBe(-1);
        }
        lastSeq = result.Ok().seq;
      }
    });

    it("should use provided seq", async () => {
      const blockLog = {
        car: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
        seq: "custom-seq-123",
      };

      const result = await BlockLogService.create(db, blockLog);

      expect(result.isOk()).toBe(true);
      expect(result.Ok().seq).toBe("custom-seq-123");
    });

    it("list all", async () => {
      for (let i = 0; i < 10; i++) {
        await BlockLogService.create(db, {
          car: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
        });
      }

      let lastSeq: string | undefined;
      const results: BlockLog[] = [];
      await consumeStream(BlockLogService.getBySeq(db), (blockLog) => {
        if (lastSeq) {
          expect(lastSeq.localeCompare(blockLog.seq)).toBe(-1);
        }
        results.push(blockLog);
        lastSeq = blockLog.seq;
      });
      expect(results.length).toBe(10);

      const results2: BlockLog[] = [];
      let first = 0;
      await consumeStream(BlockLogService.getBySeq(db, results[5].seq), (blockLog) => {
        expect(results[5].seq.localeCompare(blockLog.seq)).toBe(first);
        first = -1;
        results2.push(blockLog);
      });
      expect(results2.length).toBe(5);
    });
  });
});

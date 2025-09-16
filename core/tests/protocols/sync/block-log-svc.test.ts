
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { BlockLogService, SyncDatabase } from "@fireproof/core-protocols-sync";
import { ensureSuperThis } from "@fireproof/core-runtime";
import { BlockLog } from "@fireproof/core-types-protocols-sync";

describe("BlockLogService", () => {
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
          expect(lastSeq.localeCompare(result.Ok().seq)).toBe(-1)
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
        await db.consumeStream(BlockLogService.getBySeq(db), (blockLog) => {
            if (lastSeq) {
              expect(lastSeq.localeCompare(blockLog.seq)).toBe(-1)
            }
            results.push(blockLog);
            lastSeq = blockLog.seq;
        });
        expect(results.length).toBe(10);

        const results2: BlockLog[] = [];
        let first = 0
        await db.consumeStream(BlockLogService.getBySeq(db, results[5].seq), (blockLog) => {
            expect(results[5].seq.localeCompare(blockLog.seq)).toBe(first);
            first = -1;
            results2.push(blockLog);
        });
        expect(results2.length).toBe(5);
    })
  });

});
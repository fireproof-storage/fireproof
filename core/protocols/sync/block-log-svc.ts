import { BlockLog, BlockLogSchema } from "@fireproof/core-types-protocols-sync";
import { SyncDatabase } from "./sync-db.js";
import { exception2Result, Result } from "@adviser/cement";

type CreateBlockLog = Omit<Omit<BlockLog, "type">, "seq"> & { seq?: string };

export const BlockLogService = {
  create: async (db: SyncDatabase, blockLog: CreateBlockLog): Promise<Result<BlockLog>> => {
    const entry: BlockLog = {
      type: "block",
      seq: blockLog.seq || db.sthis.timeOrderedNextId().str,
      ...blockLog,
    };
    // Validate with Zod schema
    const validated = BlockLogSchema.safeParse(entry);
    if (!validated.success) {
      return Result.Err(validated.error);
    }
    return exception2Result(() => db.blockLogs.add(validated.data).then((_) => validated.data))
  },

  getBySeq: (db: SyncDatabase, seq = ""): ReadableStream<BlockLog> => {
    return new ReadableStream({
      start: (controller) => {
        db.blockLogs
          .where("seq")
          .aboveOrEqual(seq)
          .each((blockLog) => {
            controller.enqueue(blockLog);
          }).then(() => controller.close());
        // controller.close();
      },
    });
  },
};

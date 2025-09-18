import { BlockLog, BlockLogSchema, DBTable, toKV } from "@fireproof/core-types-blockstore";
import { Result } from "@adviser/cement";
import { WithSuperThis } from "@fireproof/core-types-base";

type CreateBlockLog = Omit<Omit<BlockLog, "type">, "seq"> & { seq?: string };

export const BlockLogService = {
  create: async (db: WithSuperThis<DBTable<BlockLog>>, blockLog: CreateBlockLog): Promise<Result<BlockLog>> => {
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
    return db.add(toKV(validated.data.seq, validated.data)).then((rKv) => {
      switch (true) {
        case rKv.isErr():
          return Result.Err(rKv);
        case rKv.isOk():
          return Result.Ok(rKv.Ok()[0].value);
        default:
          return Result.Err(new Error("unknown result"));
      }
    });
  },

  getBySeq: (db: DBTable<BlockLog>, seq = ""): ReadableStream<BlockLog> => {
    return db.list(seq);
    // return new ReadableStream({
    //   start: (controller) => {
    //     db.l
    //       .where("seq")
    //       .aboveOrEqual(seq)
    //       .each((blockLog) => {
    //         controller.enqueue(blockLog);
    //       }).then(() => controller.close());
    //     // controller.close();
    //   },
    // });
  },
};

import { CidSet, CidSetSchema, DBTable, toKV } from "@fireproof/core-types-blockstore";
import { Result } from "@adviser/cement";

type CreateCidSet = Omit<CidSet, "type">;

export const CidSetService = {
  get: async (db: DBTable<CidSet>, cid: string): Promise<Result<CidSet | undefined>> => {
    return db.get(cid);
  },

  put: async (db: DBTable<CidSet>, cidSet: CreateCidSet | CreateCidSet[]): Promise<Result<CidSet[]>> => {
    const iSet = Array.isArray(cidSet) ? cidSet : [cidSet];
    const entries: Result<CidSet>[] = iSet
      .map((cidSet) => {
        return {
          type: "cidSet",
          ...cidSet,
        };
      })
      .map((i) => CidSetSchema.safeParse(i))
      .map((i) => {
        if (!i.success) {
          return Result.Err(i.error);
        }
        return Result.Ok(i.data);
      });

    if (entries.some((i) => i.isErr())) {
      return Result.Err(
        entries
          .filter((i) => i.isErr())
          .map((i) => i.Err().message)
          .join("\n"),
      );
    }
    const okEntries = entries.map((i) => toKV(i.Ok().cid, i.Ok()));
    return db.add(...okEntries).then((rKv) => {
      switch (true) {
        case rKv.isErr():
          return Result.Err(rKv);
        case rKv.isOk():
          return Result.Ok(rKv.Ok().map((i) => i.value));
        default:
          return Result.Err("unknown result");
      }
    });
  },
};

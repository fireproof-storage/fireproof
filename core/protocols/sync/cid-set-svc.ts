
import { CidSet, CidSetSchema } from "@fireproof/core-types-protocols-sync";
import { SyncDatabase } from "./sync-db.js";
import { exception2Result, Result } from "@adviser/cement";

type CreateCidSet = Omit<CidSet, "type">;

export const CidSetService = {
  get: async (db: SyncDatabase, cid: string): Promise<Result<CidSet | undefined>> => {
    return exception2Result(async () => {
      const cidSet = await db.cidSets.get(cid);
      return cidSet;
    });
  },

  put: async (db: SyncDatabase, cidSet: CreateCidSet | CreateCidSet[]): Promise<Result<CidSet[]>> => {
    const iSet = Array.isArray(cidSet) ? cidSet : [cidSet];
    const entries: Result<CidSet>[] = iSet.map((cidSet) => {
      return {
        type: "cidSet",
        ...cidSet,
      };
    }).map((i) => CidSetSchema.safeParse(i)).map((i) => {
      if (!i.success) {
        return Result.Err(i.error);
      }
      return Result.Ok(i.data);
    });

    if (entries.some((i) => i.isErr())) {
      return Result.Err(entries.filter((i) => i.isErr()).map((i) => i.Err().message).join("\n"));
    }
    const okEntries = entries.map((i) => i.Ok());
    return exception2Result(() => db.cidSets.bulkAdd(okEntries).then(() => okEntries));
  },
};


import { Result } from "@adviser/cement";
import { ResTokenByResultId } from "@fireproof/core-protocols-dashboard";
import { lt } from "drizzle-orm";
import { TokenByResultIdParam } from "../api.js";
import { sqlTokenByResultId } from "../token-by-result-id.js";
import { BackendContext } from "./context.js";

export async function dbAddTokenByResultId({ db }: BackendContext, req: TokenByResultIdParam): Promise<Result<ResTokenByResultId>> {
  const now = (req.now ?? new Date()).toISOString();
  await db
    .insert(sqlTokenByResultId)
    .values({
      resultId: req.resultId,
      status: req.status,
      token: req.token,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [sqlTokenByResultId.resultId],
      set: {
        updatedAt: now,
        resultId: req.resultId,
        token: req.token,
        status: req.status,
      },
    })
    .run();
  const past = new Date(new Date(now).getTime() - 15 * 60 * 1000).toISOString();
  await db.delete(sqlTokenByResultId).where(lt(sqlTokenByResultId.updatedAt, past)).run();
  return Result.Ok({
    type: "resTokenByResultId",
    ...req,
  });
}

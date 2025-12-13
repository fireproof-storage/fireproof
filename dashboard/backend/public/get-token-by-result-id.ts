import { Result } from "@adviser/cement";
import { ReqTokenByResultId, ResTokenByResultId } from "@fireproof/core-protocols-dashboard";
import { and, eq, gte } from "drizzle-orm";
import { sqlTokenByResultId } from "../sql/token-by-result-id.js";
import { FPApiSQLCtx } from "../types.js";

// this is why to expensive --- why not kv or other simple storage
export async function getTokenByResultId(ctx: FPApiSQLCtx, req: ReqTokenByResultId): Promise<Result<ResTokenByResultId>> {
  const past = new Date(new Date().getTime() - 15 * 60 * 1000).toISOString();
  const out = await ctx.db
    .select()
    .from(sqlTokenByResultId)
    .where(and(eq(sqlTokenByResultId.resultId, req.resultId), gte(sqlTokenByResultId.updatedAt, past)))
    .get();
  if (!out || out.status !== "found" || !out.token) {
    return Result.Ok({
      type: "resTokenByResultId",
      resultId: req.resultId,
      status: "not-found",
    });
  }
  await ctx.db.delete(sqlTokenByResultId).where(eq(sqlTokenByResultId.resultId, req.resultId)).run();
  return Result.Ok({
    type: "resTokenByResultId",
    resultId: out.resultId,
    token: out.token,
    status: "found",
  });
}

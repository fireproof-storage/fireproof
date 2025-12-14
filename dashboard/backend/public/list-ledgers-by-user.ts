import { Result } from "@adviser/cement";
import { ReqListLedgersByUser, ResListLedgersByUser } from "@fireproof/core-protocols-dashboard";
import { and, eq, inArray } from "drizzle-orm";
import { sqlLedgerUsers, sqlLedgers, sqlToLedgers } from "../sql/ledgers.js";
import { FPApiSQLCtx, ReqWithVerifiedAuthUser } from "../types.js";

export async function listLedgersByUser(
  ctx: FPApiSQLCtx,
  req: ReqWithVerifiedAuthUser<ReqListLedgersByUser>,
): Promise<Result<ResListLedgersByUser>> {
  let condition = and(eq(sqlLedgerUsers.userId, req.auth.user.userId));
  if (req.tenantIds && req.tenantIds.length) {
    condition = and(condition, inArray(sqlLedgers.tenantId, req.tenantIds));
  }
  const rows = await ctx.db
    .select()
    .from(sqlLedgers)
    .innerJoin(sqlLedgerUsers, and(eq(sqlLedgers.ledgerId, sqlLedgerUsers.ledgerId)))
    .where(condition)
    .all();
  return Result.Ok({
    type: "resListLedgersByUser",
    userId: req.auth.user.userId,
    ledgers: sqlToLedgers(rows),
  });
}

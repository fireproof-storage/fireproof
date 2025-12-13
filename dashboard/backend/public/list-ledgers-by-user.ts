import { Result } from "@adviser/cement";
import { ReqListLedgersByUser, ResListLedgersByUser } from "@fireproof/core-protocols-dashboard";
import { and, eq, inArray } from "drizzle-orm";
import { sqlLedgerUsers, sqlLedgers, sqlToLedgers } from "../sql/ledgers.js";
import { UserNotFoundError } from "../sql/users.js";
import { activeUser } from "../internal/auth.js";
import { FPApiSQLCtx } from "../types.js";

export async function listLedgersByUser(ctx: FPApiSQLCtx, req: ReqListLedgersByUser): Promise<Result<ResListLedgersByUser>> {
  const rAuth = await activeUser(ctx, req);
  if (rAuth.isErr()) {
    return Result.Err(rAuth.Err());
  }
  const auth = rAuth.Ok();
  if (!auth.user) {
    return Result.Err(new UserNotFoundError());
  }
  // const now = new Date().toISOString();
  let condition = and(eq(sqlLedgerUsers.userId, auth.user.userId));
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
    userId: auth.user.userId,
    ledgers: sqlToLedgers(rows),
  });
}

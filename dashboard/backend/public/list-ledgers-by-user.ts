import { EventoHandler, Result, EventoResultType, HandleTriggerCtx } from "@adviser/cement";
import { ReqListLedgersByUser, ResListLedgersByUser, validateListLedgersByUser } from "@fireproof/core-types-protocols-dashboard";
import { and, eq, inArray } from "drizzle-orm";
import { sqlLedgerUsers, sqlLedgers, sqlToLedgers } from "../sql/ledgers.js";
import { FPApiSQLCtx, ReqWithVerifiedAuthUser } from "../types.js";
import { checkAuth, wrapStop } from "../utils/index.js";

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

export const listLedgersByUserItem: EventoHandler<Request, ReqListLedgersByUser, ResListLedgersByUser> = {
  hash: "list-ledgers-by-user",
  validate: (ctx) => validateListLedgersByUser(ctx.enRequest),
  handle: checkAuth(
    async (
      ctx: HandleTriggerCtx<Request, ReqWithVerifiedAuthUser<ReqListLedgersByUser>, ResListLedgersByUser>,
    ): Promise<Result<EventoResultType>> => {
      const res = await listLedgersByUser(ctx.ctx.getOrThrow("fpApiCtx"), ctx.validated);
      if (res.isErr()) {
        return Result.Err(res);
      }
      return wrapStop(ctx.send.send(ctx, res.Ok()));
    },
  ),
};

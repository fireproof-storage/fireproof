import { EventoHandler, Result, EventoResultType, HandleTriggerCtx } from "@adviser/cement";
import { ReqDeleteLedger, ResDeleteLedger, validateDeleteLedger } from "@fireproof/core-types-protocols-dashboard";
import { eq } from "drizzle-orm";
import { sqlLedgerUsers, sqlLedgers } from "../sql/ledgers.js";
import { FPApiSQLCtx, ReqWithVerifiedAuthUser } from "../types.js";
import { isAdminOfLedger } from "../internal/is-admin-of-ledger.js";
import { checkAuth, wrapStop } from "../utils/index.js";

async function deleteLedger(ctx: FPApiSQLCtx, req: ReqWithVerifiedAuthUser<ReqDeleteLedger>): Promise<Result<ResDeleteLedger>> {
  // check if owner or admin of tenant
  if (!(await isAdminOfLedger(ctx, req.auth.user.userId, req.ledger.ledgerId))) {
    return Result.Err("not owner or admin of tenant");
  }
  await ctx.db.delete(sqlLedgerUsers).where(eq(sqlLedgerUsers.ledgerId, req.ledger.ledgerId)).run();
  await ctx.db.delete(sqlLedgers).where(eq(sqlLedgers.ledgerId, req.ledger.ledgerId)).run();
  return Result.Ok({
    type: "resDeleteLedger",
    ledgerId: req.ledger.ledgerId,
  });
}

export const deleteLedgerItem: EventoHandler<Request, ReqDeleteLedger, ResDeleteLedger> = {
  hash: "delete-ledger",
  validate: (ctx) => validateDeleteLedger(ctx.enRequest),
  handle: checkAuth(
    async (
      ctx: HandleTriggerCtx<Request, ReqWithVerifiedAuthUser<ReqDeleteLedger>, ResDeleteLedger>,
    ): Promise<Result<EventoResultType>> => {
      const res = await deleteLedger(ctx.ctx.getOrThrow("fpApiCtx"), ctx.validated);
      if (res.isErr()) {
        return Result.Err(res);
      }
      return wrapStop(ctx.send.send(ctx, res.Ok()));
    },
  ),
};

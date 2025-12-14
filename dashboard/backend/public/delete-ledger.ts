import { Result } from "@adviser/cement";
import { ReqDeleteLedger, ResDeleteLedger } from "@fireproof/core-protocols-dashboard";
import { eq } from "drizzle-orm";
import { sqlLedgerUsers, sqlLedgers } from "../sql/ledgers.js";
import { FPApiSQLCtx, ReqWithVerifiedAuthUser } from "../types.js";
import { isAdminOfLedger } from "../internal/is-admin-of-ledger.js";

export async function deleteLedger(
  ctx: FPApiSQLCtx,
  req: ReqWithVerifiedAuthUser<ReqDeleteLedger>,
): Promise<Result<ResDeleteLedger>> {
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

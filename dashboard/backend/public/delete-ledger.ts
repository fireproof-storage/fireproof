import { Result } from "@adviser/cement";
import { ReqDeleteLedger, ResDeleteLedger } from "@fireproof/core-protocols-dashboard";
import { eq } from "drizzle-orm";
import { sqlLedgerUsers, sqlLedgers } from "../sql/ledgers.js";
import { UserNotFoundError } from "../sql/users.js";
import { activeUser } from "../internal/auth.js";
import { FPApiSQLCtx } from "../types.js";
import { isAdminOfLedger } from "../internal/is-admin-of-ledger.js";

export async function deleteLedger(ctx: FPApiSQLCtx, req: ReqDeleteLedger): Promise<Result<ResDeleteLedger>> {
  const rAuth = await activeUser(ctx, req);
  if (rAuth.isErr()) {
    return Result.Err(rAuth.Err());
  }
  const auth = rAuth.Ok();
  if (!auth.user) {
    return Result.Err(new UserNotFoundError());
  }
  // const now = new Date().toISOString();
  // check if owner or admin of tenant
  if (!(await isAdminOfLedger(ctx, auth.user.userId, req.ledger.ledgerId))) {
    return Result.Err("not owner or admin of tenant");
  }
  await ctx.db.delete(sqlLedgerUsers).where(eq(sqlLedgerUsers.ledgerId, req.ledger.ledgerId)).run();
  await ctx.db.delete(sqlLedgers).where(eq(sqlLedgers.ledgerId, req.ledger.ledgerId)).run();
  return Result.Ok({
    type: "resDeleteLedger",
    ledgerId: req.ledger.ledgerId,
  });
}

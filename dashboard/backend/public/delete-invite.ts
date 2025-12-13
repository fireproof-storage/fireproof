import { Result } from "@adviser/cement";
import { ReqDeleteInvite, ResDeleteInvite } from "@fireproof/core-protocols-dashboard";
import { UserNotFoundError } from "../sql/users.js";
import { activeUser } from "../internal/auth.js";
import { FPApiSQLCtx } from "../types.js";
import { sqlInviteTickets } from "../sql/db-api-schema.js";
import { eq } from "drizzle-orm/sql/expressions/conditions";

export async function deleteInvite(ctx: FPApiSQLCtx, req: ReqDeleteInvite): Promise<Result<ResDeleteInvite>> {
  const rAuth = await activeUser(ctx, req);
  if (rAuth.isErr()) {
    return Result.Err(rAuth.Err());
  }
  const auth = rAuth.Ok();
  if (!auth.user) {
    return Result.Err(new UserNotFoundError());
  }
  await ctx.db.delete(sqlInviteTickets).where(eq(sqlInviteTickets.inviteId, req.inviteId)).run();
  return Result.Ok({
    type: "resDeleteInvite",
    inviteId: req.inviteId,
  });
}

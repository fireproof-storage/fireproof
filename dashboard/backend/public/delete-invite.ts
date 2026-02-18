import { EventoHandler, Result, EventoResultType, HandleTriggerCtx } from "@adviser/cement";
import { ReqDeleteInvite, ResDeleteInvite, validateDeleteInvite } from "@fireproof/core-types-protocols-dashboard";
import { FPApiSQLCtx, ReqWithVerifiedAuthUser } from "../types.js";
import { sqlInviteTickets } from "../sql/db-api-schema.js";
import { eq } from "drizzle-orm/sql/expressions/conditions";
import { checkAuth, wrapStop } from "../utils/index.js";

async function deleteInvite(ctx: FPApiSQLCtx, req: ReqWithVerifiedAuthUser<ReqDeleteInvite>): Promise<Result<ResDeleteInvite>> {
  // const rAuth = await activeUser(ctx, req);
  // if (rAuth.isErr()) {
  //   return Result.Err(rAuth.Err());
  // }
  // const auth = rAuth.Ok();
  // if (!isVerifiedUserActive(auth)) {
  //   return Result.Err(new UserNotFoundError());
  // }
  await ctx.db.delete(sqlInviteTickets).where(eq(sqlInviteTickets.inviteId, req.inviteId)).run();
  return Result.Ok({
    type: "resDeleteInvite",
    inviteId: req.inviteId,
  });
}

export const deleteInviteItem: EventoHandler<Request, ReqDeleteInvite, ResDeleteInvite> = {
  hash: "delete-invite",
  validate: (ctx) => validateDeleteInvite(ctx.enRequest),
  handle: checkAuth(
    async (
      ctx: HandleTriggerCtx<Request, ReqWithVerifiedAuthUser<ReqDeleteInvite>, ResDeleteInvite>,
    ): Promise<Result<EventoResultType>> => {
      const res = await deleteInvite(ctx.ctx.getOrThrow("fpApiCtx"), ctx.validated);
      if (res.isErr()) {
        return Result.Err(res);
      }
      return wrapStop(ctx.send.send(ctx, res.Ok()));
    },
  ),
};

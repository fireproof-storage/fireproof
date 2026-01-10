import { EventoHandler, Result, EventoResultType, HandleTriggerCtx } from "@adviser/cement";
import { ReqFindUser, ResFindUser, validateFindUser } from "@fireproof/core-types-protocols-dashboard";
import { queryUser } from "../sql/users.js";
import { FPApiSQLCtx, ReqWithVerifiedAuthUser } from "../types.js";
import { checkAuth, wrapStop } from "../utils/index.js";

async function findUser(ctx: FPApiSQLCtx, req: ReqWithVerifiedAuthUser<ReqFindUser>): Promise<Result<ResFindUser>> {
  const rRows = await queryUser(ctx.db, req.query);
  if (rRows.isErr()) {
    return Result.Err(rRows);
  }
  return Result.Ok({
    type: "resFindUser",
    query: req.query,
    results: rRows.Ok(),
    // .map(
    //   (row) =>
    //     ({
    //       userId: row.userId,
    //       authProvider: row.queryProvider as AuthProvider,
    //       email: row.queryEmail as string,
    //       nick: row.queryNick as string,
    //       status: row.status as UserStatus,
    //       createdAt: new Date(row.createdAt),
    //       updatedAt: new Date(row.updatedAt),
    //     }) satisfies QueryResultUser,
    // ),
  });
}

export const findUserItem: EventoHandler<Request, ReqFindUser, ResFindUser> = {
  hash: "find-user",
  validate: (ctx) => validateFindUser(ctx.enRequest),
  handle: checkAuth(
    async (
      ctx: HandleTriggerCtx<Request, ReqWithVerifiedAuthUser<ReqFindUser>, ResFindUser>,
    ): Promise<Result<EventoResultType>> => {
      const res = await findUser(ctx.ctx.getOrThrow("fpApiCtx"), ctx.validated);
      if (res.isErr()) {
        return Result.Err(res);
      }
      return wrapStop(ctx.send.send(ctx, res.Ok()));
    },
  ),
};

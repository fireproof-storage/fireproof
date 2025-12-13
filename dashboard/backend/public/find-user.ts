import { Result } from "@adviser/cement";
import { ReqFindUser, ResFindUser } from "@fireproof/core-protocols-dashboard";
import { UserNotFoundError, queryUser } from "../sql/users.js";
import { activeUser } from "../internal/auth.js";
import { FPApiSQLCtx } from "../types.js";

export async function findUser(ctx: FPApiSQLCtx, req: ReqFindUser): Promise<Result<ResFindUser>> {
  const rAuth = await activeUser(ctx, req);
  if (rAuth.isErr()) {
    return Result.Err(rAuth.Err());
  }
  const auth = rAuth.Ok();
  if (!auth.user) {
    return Result.Err(new UserNotFoundError());
  }
  const rRows = await queryUser(ctx.db, req.query);
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

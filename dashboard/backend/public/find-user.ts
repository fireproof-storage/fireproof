import { Result } from "@adviser/cement";
import { ReqFindUser, ResFindUser } from "@fireproof/core-protocols-dashboard";
import { queryUser } from "../sql/users.js";
import { FPApiSQLCtx, ReqWithVerifiedAuthUser } from "../types.js";

export async function findUser(ctx: FPApiSQLCtx, req: ReqWithVerifiedAuthUser<ReqFindUser>): Promise<Result<ResFindUser>> {
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

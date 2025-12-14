import { Result } from "@adviser/cement";
import { DashAuthType, ClerkVerifyAuth, UserStatus } from "@fireproof/core-protocols-dashboard";
import { getUser, isUserNotFound } from "../sql/users.js";
import { WithAuth, FPApiSQLCtx, ActiveUser } from "../types.js";

export async function authVerifyAuth(ctx: FPApiSQLCtx, req: { readonly auth: DashAuthType }): Promise<Result<ClerkVerifyAuth>> {
  const tokenApi = ctx.tokenApi[req.auth.type];
  if (!tokenApi) {
    return Result.Err(`invalid auth type:[${req.auth.type}]`);
  }
  const rAuth = await tokenApi.verify(req.auth.token);
  // console.log("_authVerify-3", rAuth);
  if (rAuth.isErr()) {
    return Result.Err(rAuth.Err());
  }
  // if (rAuth.Ok().type !== "clerk") {
  //   return Result.Err("invalid auth type");
  // }
  const auth = rAuth.Ok() as ClerkVerifyAuth;
  return Result.Ok(auth);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function activeUser(ctx: FPApiSQLCtx, req: WithAuth, status: UserStatus[] = ["active"]): Promise<Result<ActiveUser>> {
  const rAuth = await authVerifyAuth(ctx, req);
  if (rAuth.isErr()) {
    return Result.Err(rAuth.Err());
  }
  const auth = rAuth.Ok();
  const rExisting = await getUser(ctx.db, auth.userId);
  if (rExisting.isErr()) {
    if (isUserNotFound(rExisting)) {
      return Result.Ok({
        verifiedAuth: auth,
      });
    }
    return Result.Err(rExisting.Err());
  }
  return Result.Ok({
    verifiedAuth: auth,
    user: rExisting.Ok(),
  });
}

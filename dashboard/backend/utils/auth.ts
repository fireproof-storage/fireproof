import { EventoResultType, HandleTriggerCtx, Result } from "@adviser/cement";
import {
  DashAuthType,
  UserStatus,
  VerifiedAuthResult,
  VerifiedClaimsResult,
  VerifiedResult,
  WithAuth,
} from "@fireproof/core-types-protocols-dashboard";
import { getUser, isUserNotFound } from "../sql/users.js";
import { FPApiSQLCtx, ReqWithVerifiedAuthUser } from "../types.js";
import { ClerkClaimSchema } from "@fireproof/core-types-base";

export async function verifyExtractClaims(
  ctx: FPApiSQLCtx,
  req: { readonly auth: DashAuthType },
): Promise<Result<VerifiedClaimsResult>> {
  const tokenApi = ctx.tokenApi[req.auth.type];
  if (!tokenApi) {
    return Result.Err(`invalid auth type:[${req.auth.type}]`);
  }
  const rAuth = await tokenApi.verify(req.auth.token);
  if (rAuth.isErr()) {
    return Result.Err(rAuth.Err());
  }
  return Result.Ok({
    type: req.auth.type,
    token: req.auth.token,
    claims: rAuth.Ok().claims,
  });
}

export function corercedVerifiedAuthUser(ver: VerifiedClaimsResult): Result<VerifiedAuthResult["verifiedAuth"]> {
  switch (ver.type) {
    case "device-id":
    case "clerk": {
      const claims = ClerkClaimSchema.safeParse(ver.claims);
      if (!claims.success) {
        return Result.Err(claims.error);
      }
      return Result.Ok({
        type: "clerk",
        claims: claims.data,
      });
    }

    default:
      return Result.Err(`unsupported verified auth type:[${ver.type}]`);
  }
}

export async function verifyAuth(
  ctx: FPApiSQLCtx,
  req: WithAuth,
  status: UserStatus[] = ["active"],
): Promise<Result<VerifiedResult>> {
  const rvec = await verifyExtractClaims(ctx, req);
  if (rvec.isErr()) {
    return Result.Err(rvec.Err());
  }
  const rVerifiedAuth = corercedVerifiedAuthUser(rvec.Ok());
  if (rVerifiedAuth.isErr()) {
    return Result.Err(rVerifiedAuth.Err());
  }
  const rExisting = await getUser(ctx.db, rVerifiedAuth.Ok().claims.userId);
  if (rExisting.isErr()) {
    if (isUserNotFound(rExisting)) {
      return Result.Ok({
        type: "VerifiedAuthResult",
        inDashAuth: req.auth,
        verifiedAuth: rVerifiedAuth.Ok(),
      });
    }
    return Result.Err(rExisting);
  }
  if (!status.includes(rExisting.Ok().status)) {
    return Result.Err(`user status invalid: ${rExisting.Ok().status}`);
  }
  return Result.Ok({
    type: "VerifiedAuthUserResult",
    inDashAuth: req.auth,
    verifiedAuth: rVerifiedAuth.Ok(),
    user: rExisting.Ok(),
  });
}

export function checkAuth<TReq extends WithAuth & { type: string }, TRes>(
  fn: (ctx: HandleTriggerCtx<Request, ReqWithVerifiedAuthUser<TReq>, TRes>) => Promise<Result<EventoResultType>>,
): (ctx: HandleTriggerCtx<Request, TReq, TRes>) => Promise<Result<EventoResultType>> {
  return async (ctx: HandleTriggerCtx<Request, TReq, TRes>) => {
    const rAuth = await verifyAuth(ctx.ctx.getOrThrow("fpApiCtx"), ctx.validated);
    if (rAuth.isErr()) {
      return Result.Err(rAuth.Err());
    }
    if (rAuth.Ok().type !== "VerifiedAuthUserResult") {
      return Result.Err(`user not found: ${JSON.stringify(rAuth.Ok().inDashAuth)}`);
    }
    // not nice but ts way of type narrowing is limited
    (ctx.validated as unknown as { auth: VerifiedResult }).auth = rAuth.Ok();
    return fn(ctx as unknown as HandleTriggerCtx<Request, ReqWithVerifiedAuthUser<TReq>, TRes>);
  };
}

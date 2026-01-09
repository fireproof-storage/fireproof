import { EventoHandler, Result, EventoResultType, HandleTriggerCtx } from "@adviser/cement";
import { ReqCreateTenant, ResCreateTenant, validateCreateTenant } from "@fireproof/core-types-protocols-dashboard";
import { FPApiSQLCtx, ReqWithVerifiedAuthUser } from "../types.js";
import { nameFromAuth, checkAuth, wrapStop } from "../utils/index.js";
import { insertTenant } from "../internal/insert-tenant.js";
import { addUserToTenant } from "../internal/add-user-to-tenant.js";

async function createTenant(ctx: FPApiSQLCtx, req: ReqWithVerifiedAuthUser<ReqCreateTenant>): Promise<Result<ResCreateTenant>> {
  const rTenant = await insertTenant(ctx, req.auth.user, {
    ...ctx.params,
    ...req.tenant,
    ownerUserId: req.auth.user.userId,
  });
  if (rTenant.isErr()) {
    return Result.Err(rTenant.Err());
  }
  const tenant = rTenant.Ok();
  await addUserToTenant(ctx, {
    userName: nameFromAuth(req.tenant.name, req.auth),
    tenantId: tenant.tenantId,
    userId: req.auth.user.userId,
    role: "admin",
    default: false,
  });
  return Result.Ok({
    type: "resCreateTenant",
    tenant,
  });
}

export const createTenantItem: EventoHandler<Request, ReqCreateTenant, ResCreateTenant> = {
  hash: "create-tenant",
  validate: (ctx) => validateCreateTenant(ctx.enRequest),
  handle: checkAuth(
    async (
      ctx: HandleTriggerCtx<Request, ReqWithVerifiedAuthUser<ReqCreateTenant>, ResCreateTenant>,
    ): Promise<Result<EventoResultType>> => {
      // console.log("create-tenant handler called", ctx.validated);
      const res = await createTenant(ctx.ctx.getOrThrow("fpApiCtx"), ctx.validated);
      if (res.isErr()) {
        return Result.Err(res);
      }
      return wrapStop(ctx.send.send(ctx, res.Ok()));
    },
  ),
};

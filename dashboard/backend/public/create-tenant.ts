import { Result } from "@adviser/cement";
import { ReqCreateTenant, ResCreateTenant } from "@fireproof/core-protocols-dashboard";
import { FPApiSQLCtx, ReqWithVerifiedAuthUser } from "../types.js";
import { nameFromAuth } from "../utils/index.js";
import { insertTenant } from "../internal/insert-tenant.js";
import { addUserToTenant } from "../internal/add-user-to-tenant.js";

export async function createTenant(
  ctx: FPApiSQLCtx,
  req: ReqWithVerifiedAuthUser<ReqCreateTenant>,
): Promise<Result<ResCreateTenant>> {
  const rTenant = await insertTenant(ctx, req.auth, {
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

import { Result } from "@adviser/cement";
import { ReqCreateTenant, ResCreateTenant } from "@fireproof/core-protocols-dashboard";
import { UserNotFoundError } from "../sql/users.js";
import { ActiveUserWithUserId, FPApiSQLCtx } from "../types.js";
import { nameFromAuth } from "../utils/index.js";
import { activeUser } from "../internal/auth.js";
import { insertTenant } from "../internal/insert-tenant.js";
import { addUserToTenant } from "../internal/add-user-to-tenant.js";

export async function createTenant(ctx: FPApiSQLCtx, req: ReqCreateTenant): Promise<Result<ResCreateTenant>> {
  const rAuth = await activeUser(ctx, req);
  if (rAuth.isErr()) {
    return Result.Err(rAuth.Err());
  }
  const auth = rAuth.Ok();
  if (!auth.user) {
    return Result.Err(new UserNotFoundError());
  }
  const rTenant = await insertTenant(ctx, auth as ActiveUserWithUserId, {
    ...ctx.params,
    ...req.tenant,
    ownerUserId: auth.user.userId,
  });
  if (rTenant.isErr()) {
    return Result.Err(rTenant.Err());
  }
  const tenant = rTenant.Ok();
  await addUserToTenant(ctx, {
    userName: nameFromAuth(req.tenant.name, auth as ActiveUserWithUserId),
    tenantId: tenant.tenantId,
    userId: auth.user.userId,
    role: "admin",
    default: false,
  });
  return Result.Ok({
    type: "resCreateTenant",
    tenant,
  });
}

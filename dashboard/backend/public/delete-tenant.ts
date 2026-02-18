import { EventoHandler, Result, EventoResultType, HandleTriggerCtx } from "@adviser/cement";
import { ReqDeleteTenant, ResDeleteTenant, validateDeleteTenant } from "@fireproof/core-types-protocols-dashboard";
import { eq } from "drizzle-orm";
import { sqlInviteTickets } from "../sql/invites.js";
import { sqlTenantUsers, sqlTenants } from "../sql/tenants.js";
import { FPApiSQLCtx, ReqWithVerifiedAuthUser } from "../types.js";
import { isAdminOfTenant } from "../internal/is-admin-of-tenant.js";
import { checkAuth, wrapStop } from "../utils/index.js";

async function deleteTenant(ctx: FPApiSQLCtx, req: ReqWithVerifiedAuthUser<ReqDeleteTenant>): Promise<Result<ResDeleteTenant>> {
  // check if owner or admin of tenant
  if (!(await isAdminOfTenant(ctx, req.auth.user.userId, req.tenantId))) {
    return Result.Err("not owner or admin of tenant");
  }
  // TODO remove ledgers
  await ctx.db.delete(sqlInviteTickets).where(eq(sqlInviteTickets.invitedTenantId, req.tenantId)).run();
  await ctx.db.delete(sqlTenantUsers).where(eq(sqlTenantUsers.tenantId, req.tenantId)).run();
  await ctx.db.delete(sqlTenants).where(eq(sqlTenants.tenantId, req.tenantId)).run();
  return Result.Ok({
    type: "resDeleteTenant",
    tenantId: req.tenantId,
  });
}

export const deleteTenantItem: EventoHandler<Request, ReqDeleteTenant, ResDeleteTenant> = {
  hash: "delete-tenant",
  validate: (ctx) => validateDeleteTenant(ctx.enRequest),
  handle: checkAuth(
    async (
      ctx: HandleTriggerCtx<Request, ReqWithVerifiedAuthUser<ReqDeleteTenant>, ResDeleteTenant>,
    ): Promise<Result<EventoResultType>> => {
      // expect(ctx.validated).toEqual({ x: 1 });
      const res = await deleteTenant(ctx.ctx.getOrThrow("fpApiCtx"), ctx.validated);
      if (res.isErr()) {
        return Result.Err(res);
      }
      return wrapStop(ctx.send.send(ctx, res.Ok()));
    },
  ),
};

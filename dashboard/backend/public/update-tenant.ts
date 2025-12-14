import { Result } from "@adviser/cement";
import { ReqUpdateTenant, ResUpdateTenant } from "@fireproof/core-protocols-dashboard";
import { eq } from "drizzle-orm";
import { sqlToOutTenantParams } from "../internal/sql-to-out-tenant-params.js";
import { sqlTenants } from "../sql/tenants.js";
import { FPApiSQLCtx, ReqWithVerifiedAuthUser } from "../types.js";
import { isAdminOfTenant } from "../internal/is-admin-of-tenant.js";

export async function updateTenant(
  ctx: FPApiSQLCtx,
  req: ReqWithVerifiedAuthUser<ReqUpdateTenant>,
): Promise<Result<ResUpdateTenant>> {
  const prev = await ctx.db.select().from(sqlTenants).where(eq(sqlTenants.tenantId, req.tenant.tenantId)).get();
  if (!prev) {
    return Result.Err("tenant not found");
  }
  if (!(await isAdminOfTenant(ctx, req.auth.user.userId, req.tenant.tenantId))) {
    return Result.Err("not owner of tenant");
  }
  const now = new Date().toISOString();
  const result = await ctx.db
    .update(sqlTenants)
    .set({
      name: req.tenant.name,
      maxAdminUsers: req.tenant.maxAdminUsers,
      maxMemberUsers: req.tenant.maxMemberUsers,
      maxInvites: req.tenant.maxInvites,
      updatedAt: now,
    })
    .where(eq(sqlTenants.tenantId, req.tenant.tenantId))
    .returning();
  return Result.Ok({
    type: "resUpdateTenant",
    tenant: sqlToOutTenantParams(result[0]),
  });
}

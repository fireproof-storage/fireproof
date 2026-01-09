import { Result } from "@adviser/cement";
import { UserStatus } from "@fireproof/core-types-protocols-dashboard";
import { toRole } from "@fireproof/core-types-protocols-cloud";
import { and, eq, ne } from "drizzle-orm";
import { toUndef } from "../sql/sql-helper.js";
import { sqlTenants, sqlTenantUsers } from "../sql/tenants.js";
import { AddUserToTenant, FPApiSQLCtx } from "../types.js";
import { getRoles } from "./get-roles.js";
import { checkMaxRoles } from "./check-max-roles.js";

export async function addUserToTenant(
  ctx: FPApiSQLCtx,
  req: Omit<AddUserToTenant, "tenantName">,
): Promise<Result<AddUserToTenant>> {
  const tenant = await ctx.db
    .select()
    .from(sqlTenants)
    .where(and(eq(sqlTenants.tenantId, req.tenantId), eq(sqlTenants.status, "active")))
    .get();
  if (!tenant) {
    return Result.Err("tenant not found");
  }
  const roles = await getRoles(ctx, req.userId, [tenant], []);
  if (roles.length > 1) {
    return Result.Err("multiple roles found");
  }
  if (roles.length && roles[0].role) {
    const tenantUser = await ctx.db
      .select()
      .from(sqlTenantUsers)
      .where(
        and(eq(sqlTenantUsers.tenantId, req.tenantId), eq(sqlTenantUsers.userId, req.userId), eq(sqlTenantUsers.status, "active")),
      )
      .get();
    if (!tenantUser) {
      return Result.Err("ref not found");
    }
    return Result.Ok({
      userName: toUndef(tenantUser.name),
      tenantName: toUndef(tenant.name),
      tenantId: req.tenantId,
      userId: req.userId,
      default: !!tenantUser.default,
      role: toRole(tenantUser.role),
      status: tenantUser.status as UserStatus,
      statusReason: tenantUser.statusReason,
    });
  }
  const rCheck = await checkMaxRoles(ctx, tenant, req.role);
  if (rCheck.isErr()) {
    return Result.Err(rCheck);
  }
  const now = new Date().toISOString();
  if (req.default) {
    await ctx.db
      .update(sqlTenantUsers)
      .set({
        default: 0,
        updatedAt: now,
      })
      .where(and(eq(sqlTenantUsers.userId, req.userId), ne(sqlTenantUsers.default, 0)))
      .run();
  }
  const ret = (
    await ctx.db
      .insert(sqlTenantUsers)
      .values({
        tenantId: tenant.tenantId,
        userId: req.userId,
        name: req.userName,
        role: req.role,
        default: req.default ? 1 : 0,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
  )[0];
  return Result.Ok({
    userName: toUndef(ret.name),
    tenantName: tenant.name,
    tenantId: tenant.tenantId,
    userId: ret.userId,
    default: ret.default ? true : false,
    status: ret.status as UserStatus,
    statusReason: ret.statusReason,
    role: toRole(ret.role),
  });
}

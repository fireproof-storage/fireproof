import { Result } from "@adviser/cement";
import { ReqUpdateUserTenant, ResUpdateUserTenant } from "@fireproof/core-protocols-dashboard";
import { toRole } from "@fireproof/core-types-protocols-cloud";
import { and, eq } from "drizzle-orm";
import { toUndef } from "../sql/sql-helper.js";
import { sqlTenantUsers } from "../sql/tenants.js";
import { UserNotFoundError } from "../sql/users.js";
import { activeUser } from "../internal/auth.js";
import { FPApiSQLCtx } from "../types.js";
import { isAdminOfTenant } from "../internal/is-admin-of-tenant.js";

export async function updateUserTenant(ctx: FPApiSQLCtx, req: ReqUpdateUserTenant): Promise<Result<ResUpdateUserTenant>> {
  const rAuth = await activeUser(ctx, req);
  if (rAuth.isErr()) {
    return Result.Err(rAuth.Err());
  }
  const auth = rAuth.Ok();
  if (!auth.user) {
    return Result.Err(new UserNotFoundError());
  }
  const userId = req.userId ?? auth.user.userId;
  if (req.role && (await isAdminOfTenant(ctx, userId, req.tenantId))) {
    await ctx.db
      .update(sqlTenantUsers)
      .set({
        role: req.role,
      })
      .where(and(eq(sqlTenantUsers.userId, userId), eq(sqlTenantUsers.tenantId, req.tenantId)))
      .run();
  }
  if (req.default) {
    await ctx.db
      .update(sqlTenantUsers)
      .set({
        default: 0,
      })
      .where(eq(sqlTenantUsers.userId, userId));
  }
  if (req.default || req.name) {
    const updateSet = {} as {
      default?: number;
      name?: string;
    };
    if (req.default) {
      updateSet.default = req.default ? 1 : 0;
    }
    if (req.name) {
      updateSet.name = req.name;
    }
    await ctx.db
      .update(sqlTenantUsers)
      .set(updateSet)
      .where(and(eq(sqlTenantUsers.userId, userId), eq(sqlTenantUsers.tenantId, req.tenantId)))
      .returning();
  }
  const ret = await ctx.db
    .select()
    .from(sqlTenantUsers)
    .innerJoin(
      sqlTenantUsers,
      and(eq(sqlTenantUsers.userId, sqlTenantUsers.userId), eq(sqlTenantUsers.tenantId, sqlTenantUsers.tenantId)),
    )
    .where(and(eq(sqlTenantUsers.userId, userId), eq(sqlTenantUsers.tenantId, req.tenantId)))
    .get();
  if (!ret) {
    return Result.Err("not found");
  }
  return Result.Ok({
    type: "resUpdateUserTenant",
    tenantId: ret.TenantUsers.tenantId,
    userId: ret.TenantUsers.userId,
    role: toRole(ret.TenantUsers.role),
    default: !!ret.TenantUsers.default,
    name: toUndef(ret.TenantUsers.name),
  });
}

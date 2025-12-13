import { Result } from "@adviser/cement";
import { ReqListTenantsByUser, ResListTenantsByUser, UserStatus } from "@fireproof/core-protocols-dashboard";
import { and, eq } from "drizzle-orm";
import { toUndef, toBoolean } from "../sql/sql-helper.js";
import { sqlTenantUsers, sqlTenants } from "../sql/tenants.js";
import { UserNotFoundError, sqlUsers } from "../sql/users.js";
import { FPApiSQLCtx } from "../types.js";
import { activeUser } from "../internal/auth.js";
import { getRoles } from "../internal/get-roles.js";

export async function listTenantsByUser(ctx: FPApiSQLCtx, req: ReqListTenantsByUser): Promise<Result<ResListTenantsByUser>> {
  const rAUR = await activeUser(ctx, req);
  if (rAUR.isErr()) {
    return Result.Err(rAUR.Err());
  }
  const aur = rAUR.Ok();
  if (!aur.user) {
    return Result.Err(new UserNotFoundError());
  }
  const tenantUsers = await ctx.db
    .select()
    .from(sqlTenantUsers)
    .innerJoin(sqlTenants, and(eq(sqlTenantUsers.tenantId, sqlTenants.tenantId)))
    .innerJoin(sqlUsers, and(eq(sqlTenantUsers.userId, sqlUsers.userId)))
    .where(eq(sqlTenantUsers.userId, aur.user.userId))
    .all();
  // console.log(">>>>>", tenantUser);

  return Result.Ok({
    type: "resListTenantsByUser",
    userId: aur.user.userId,
    authUserId: aur.verifiedAuth.userId,
    tenants: (
      await Promise.all(
        tenantUsers.map(async (t) => {
          const common = {
            user: {
              name: toUndef(t.TenantUsers.name),
              status: t.TenantUsers.status as UserStatus,
              statusReason: t.TenantUsers.statusReason,
              limits: {
                maxTenants: t.Users.maxTenants,
              },
              createdAt: new Date(t.TenantUsers.createdAt),
              updatedAt: new Date(t.TenantUsers.updatedAt),
            },
            tenant: {
              name: toUndef(t.Tenants.name),
              status: t.Tenants.status as UserStatus,
              limits: {
                maxAdminUsers: t.Tenants.maxAdminUsers,
                maxMemberUsers: t.Tenants.maxMemberUsers,
                maxInvites: t.Tenants.maxInvites,
                maxLedgers: t.Tenants.maxLedgers,
              },
              statusReason: t.Tenants.statusReason,
              createdAt: new Date(t.Tenants.createdAt),
              updatedAt: new Date(t.Tenants.updatedAt),
            },
          };
          const roles = await getRoles(ctx, t.TenantUsers.userId, [t.Tenants], []);
          if (roles.length > 1) {
            throw new Error("multiple roles found");
          }
          if (!roles.length) {
            return undefined;
          }
          switch (roles[0].role) {
            case "member":
              return {
                ...common,
                tenantId: t.TenantUsers.tenantId,
                role: roles[0].role,
                default: toBoolean(t.TenantUsers.default),
              };
            // case "owner":
            case "admin":
              return {
                ...common,
                tenantId: t.TenantUsers.tenantId,
                role: roles[0].role,
                default: toBoolean(t.TenantUsers.default),
                adminUserIds: roles[0].adminUserIds,
                memberUserIds: roles[0].memberUserIds,
              };
            default:
              throw new Error("invalid role");
          }
        }),
      )
    ).filter((t) => !!t),
  });
}

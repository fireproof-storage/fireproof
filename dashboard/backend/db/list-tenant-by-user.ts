import { Result } from "@adviser/cement";
import { ActiveUserWithUserId, ResListTenantsByUser, UserStatus } from "@fireproof/core-protocols-dashboard";
import { and, eq } from "drizzle-orm";
import { toUndef, toBoolean } from "../sql-helper.js";
import { sqlTenantUsers, sqlTenants } from "../tenants.js";
import { BackendContext } from "./context.js";
import { dbGetRoles } from "./get-roles.js";

export async function dbListTenantsByUser(ctx: BackendContext, aur: ActiveUserWithUserId): Promise<Result<ResListTenantsByUser>> {
  const { db } = ctx;
  const tenantUsers = await db
    .select()
    .from(sqlTenantUsers)
    .innerJoin(sqlTenants, and(eq(sqlTenantUsers.tenantId, sqlTenants.tenantId)))
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
              createdAt: new Date(t.TenantUsers.createdAt),
              updatedAt: new Date(t.TenantUsers.updatedAt),
            },
            tenant: {
              name: toUndef(t.Tenants.name),
              status: t.Tenants.status as UserStatus,
              statusReason: t.Tenants.statusReason,
              createdAt: new Date(t.Tenants.createdAt),
              updatedAt: new Date(t.Tenants.updatedAt),
            },
          };
          const roles = await dbGetRoles(ctx, t.TenantUsers.userId, [t.Tenants], []);
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
                maxAdminUsers: t.Tenants.maxAdminUsers,
                maxMemberUsers: t.Tenants.maxMemberUsers,
              };
            default:
              throw new Error("invalid role");
          }
        }),
      )
    ).filter((t) => !!t),
  });
}

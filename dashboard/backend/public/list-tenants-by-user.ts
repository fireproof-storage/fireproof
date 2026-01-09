import { EventoHandler, Result, EventoResultType, HandleTriggerCtx } from "@adviser/cement";
import {
  ReqListTenantsByUser,
  ResListTenantsByUser,
  UserStatus,
  validateListTenantsByUser,
} from "@fireproof/core-types-protocols-dashboard";
import { and, eq } from "drizzle-orm";
import { toUndef, toBoolean } from "../sql/sql-helper.js";
import { sqlTenantUsers, sqlTenants } from "../sql/tenants.js";
import { sqlUsers } from "../sql/users.js";
import { FPApiSQLCtx, ReqWithVerifiedAuthUser } from "../types.js";
import { getRoles } from "../internal/get-roles.js";
import { checkAuth, wrapStop } from "../utils/index.js";

export async function listTenantsByUser(
  ctx: FPApiSQLCtx,
  req: ReqWithVerifiedAuthUser<ReqListTenantsByUser>,
): Promise<Result<ResListTenantsByUser>> {
  const tenantUsers = await ctx.db
    .select()
    .from(sqlTenantUsers)
    .innerJoin(sqlTenants, and(eq(sqlTenantUsers.tenantId, sqlTenants.tenantId)))
    .innerJoin(sqlUsers, and(eq(sqlTenantUsers.userId, sqlUsers.userId)))
    .where(eq(sqlTenantUsers.userId, req.auth.user.userId))
    .all();

  return Result.Ok({
    type: "resListTenantsByUser",
    userId: req.auth.user.userId,
    authUserId: req.auth.verifiedAuth.claims.userId,
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

export const listTenantsByUserItem: EventoHandler<Request, ReqListTenantsByUser, ResListTenantsByUser> = {
  hash: "list-tenants-by-user",
  validate: (ctx) => validateListTenantsByUser(ctx.enRequest),
  handle: checkAuth(
    async (
      ctx: HandleTriggerCtx<Request, ReqWithVerifiedAuthUser<ReqListTenantsByUser>, ResListTenantsByUser>,
    ): Promise<Result<EventoResultType>> => {
      const res = await listTenantsByUser(ctx.ctx.getOrThrow("fpApiCtx"), ctx.validated);
      if (res.isErr()) {
        return Result.Err(res);
      }
      return wrapStop(ctx.send.send(ctx, res.Ok()));
    },
  ),
};

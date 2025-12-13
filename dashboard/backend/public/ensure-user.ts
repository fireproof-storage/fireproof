import { Result } from "@adviser/cement";
import { ReqEnsureUser, ResEnsureUser } from "@fireproof/core-protocols-dashboard";
import { getTableColumns, eq } from "drizzle-orm";
import { queryEmail, queryNick } from "../sql/sql-helper.js";
import { sqlTenants } from "../sql/tenants.js";
import { upsetUserByProvider, sqlUsers } from "../sql/users.js";
import { nickFromClarkClaim, nameFromAuth } from "../utils/index.js";
import { addUserToTenant } from "../internal/add-user-to-tenant.js";
import { insertTenant } from "../internal/insert-tenant.js";
import { FPApiSQLCtx } from "../types.js";
import { listTenantsByUser } from "./list-tenants-by-user.js";
import { redeemInvite } from "./redeem-invite.js";
import { activeUser } from "../internal/auth.js";

export async function ensureUser(ctx: FPApiSQLCtx, req: ReqEnsureUser): Promise<Result<ResEnsureUser>> {
  const rAuth = await activeUser(ctx, req);
  if (rAuth.isErr()) {
    return Result.Err(rAuth.Err());
  }
  const user = rAuth.Ok().user;
  if (!user) {
    const auth = rAuth.Ok().verifiedAuth;
    const userId = ctx.sthis.nextId(12).str;
    const now = new Date();
    await upsetUserByProvider(
      ctx.db,
      {
        userId,
        maxTenants: ctx.params.maxTenants,
        status: "active",
        statusReason: "just created",
        byProviders: [
          {
            providerUserId: auth.userId,
            queryProvider: nickFromClarkClaim(auth.params) ? "github" : "google",
            queryEmail: queryEmail(auth.params.email),
            cleanEmail: auth.params.email,
            queryNick: queryNick(nickFromClarkClaim(auth.params)),
            cleanNick: nickFromClarkClaim(auth.params),
            params: auth.params,
            used: now,
          },
        ],
      },
      now,
    );
    const authWithUserId = {
      ...rAuth.Ok(),
      user: {
        userId,
        maxTenants: ctx.params.maxTenants,
      },
    };
    const rTenant = await insertTenant(ctx, authWithUserId, {
      ...ctx.params,
      ownerUserId: userId,
    });
    await addUserToTenant(ctx, {
      userName: nameFromAuth(undefined, authWithUserId),
      tenantId: rTenant.Ok().tenantId,
      userId: userId,
      role: "admin",
      default: true,
    });

    // });
    return ensureUser(ctx, req);
  }
  const rTenants = await listTenantsByUser(ctx, {
    type: "reqListTenantsByUser",
    auth: req.auth,
  });
  if (rTenants.isErr()) {
    return Result.Err(rTenants);
  }
  const tenants = rTenants.Ok().tenants;
  const colSqlUsers = getTableColumns(sqlUsers);
  const colSqlTenants = getTableColumns(sqlTenants);
  const sqlDefaultLimits = {
    maxTenants: (colSqlUsers.maxTenants.default?.valueOf() as number) ?? 5,
    maxAdminUsers: (colSqlTenants.maxAdminUsers.default?.valueOf() as number) ?? 5,
    maxMemberUsers: (colSqlTenants.maxMemberUsers.default?.valueOf() as number) ?? 5,
    maxInvites: (colSqlTenants.maxInvites.default?.valueOf() as number) ?? 10,
    maxLedgers: (colSqlTenants.maxLedgers.default?.valueOf() as number) ?? 5,
  };
  for (const tenant of tenants) {
    // old default limit now overridden by params
    if (
      (ctx.params.maxTenants > sqlDefaultLimits.maxTenants && tenant.user.limits.maxTenants === sqlDefaultLimits.maxTenants) ||
      (ctx.params.maxAdminUsers > sqlDefaultLimits.maxAdminUsers &&
        tenant.tenant.limits.maxAdminUsers === sqlDefaultLimits.maxAdminUsers) ||
      (ctx.params.maxMemberUsers > sqlDefaultLimits.maxMemberUsers &&
        tenant.tenant.limits.maxMemberUsers === sqlDefaultLimits.maxMemberUsers) ||
      (ctx.params.maxInvites > sqlDefaultLimits.maxInvites && tenant.tenant.limits.maxInvites === sqlDefaultLimits.maxInvites) ||
      (ctx.params.maxLedgers > sqlDefaultLimits.maxLedgers && tenant.tenant.limits.maxLedgers === sqlDefaultLimits.maxLedgers)
    ) {
      // console.log("updating user/tenant limits...", this.params);
      (user as { maxTenants: number }).maxTenants = ctx.params.maxTenants;
      await ctx.db
        .update(sqlUsers)
        .set({
          maxTenants: ctx.params.maxTenants,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(sqlUsers.userId, user.userId))
        .run();
      (tenant.tenant.limits as { maxAdminUsers: number }).maxAdminUsers = ctx.params.maxAdminUsers;
      (tenant.tenant.limits as { maxMemberUsers: number }).maxMemberUsers = ctx.params.maxMemberUsers;
      (tenant.tenant.limits as { maxInvites: number }).maxInvites = ctx.params.maxInvites;
      (tenant.tenant.limits as { maxLedgers: number }).maxLedgers = ctx.params.maxLedgers;
      await ctx.db
        .update(sqlTenants)
        .set({
          maxAdminUsers: ctx.params.maxAdminUsers,
          maxMemberUsers: ctx.params.maxMemberUsers,
          maxInvites: ctx.params.maxInvites,
          maxLedgers: ctx.params.maxLedgers,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(sqlTenants.tenantId, tenant.tenantId))
        .run();
    }
  }
  // Auto-redeem any pending invites for this user
  await redeemInvite(ctx, {
    type: "reqRedeemInvite",
    auth: req.auth,
  });
  return Result.Ok({
    type: "resEnsureUser",
    user: user,
    tenants,
  });
}

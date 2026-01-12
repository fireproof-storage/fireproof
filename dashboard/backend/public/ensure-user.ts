import { EventoHandler, Result, EventoResultType, HandleTriggerCtx } from "@adviser/cement";
import {
  isVerifiedAuthUser,
  ReqEnsureUser,
  ResEnsureUser,
  User,
  validateEnsureUser,
  VerifiedAuthUserResult,
} from "@fireproof/core-types-protocols-dashboard";
import { getTableColumns, eq } from "drizzle-orm";
import { queryEmail, queryNick } from "../sql/sql-helper.js";
import { sqlTenants } from "../sql/tenants.js";
import { upsetUserByProvider, sqlUsers, UserByProviderWithoutDate } from "../sql/users.js";
import { nickFromClarkClaim, nameFromAuth, wrapStop, verifyAuth } from "../utils/index.js";
import { addUserToTenant } from "../internal/add-user-to-tenant.js";
import { insertTenant } from "../internal/insert-tenant.js";
import { FPApiSQLCtx } from "../types.js";
import { listTenantsByUser } from "./list-tenants-by-user.js";
import { redeemInvite } from "./redeem-invite.js";

export async function ensureUser(ctx: FPApiSQLCtx, req: ReqEnsureUser): Promise<Result<ResEnsureUser>> {
  const rAuth = await verifyAuth(ctx, req);
  if (rAuth.isErr()) {
    return Result.Err(rAuth.Err());
  }
  const auth = rAuth.Ok();
  if (!isVerifiedAuthUser(auth)) {
    const auth = rAuth.Ok();
    const userId = ctx.sthis.nextId(12).str;
    const now = new Date();
    let queryProvider: UserByProviderWithoutDate;
    switch (auth.inDashAuth.type) {
      case "device-id":
        queryProvider = {
          providerUserId: auth.verifiedAuth.claims.userId,
          queryProvider: "device-id",
          queryEmail: queryEmail(auth.verifiedAuth.claims.params.email),
          cleanEmail: auth.verifiedAuth.claims.params.email,
          queryNick: queryNick(nickFromClarkClaim(auth.verifiedAuth.claims.params)),
          cleanNick: nickFromClarkClaim(auth.verifiedAuth.claims.params),
          params: auth.verifiedAuth.claims.params,
          used: now,
        };
        break;
      case "clerk":
        queryProvider = {
          providerUserId: auth.verifiedAuth.claims.userId,
          queryProvider: nickFromClarkClaim(auth.verifiedAuth.claims.params) ? "github" : "google",
          queryEmail: queryEmail(auth.verifiedAuth.claims.params.email),
          cleanEmail: auth.verifiedAuth.claims.params.email,
          queryNick: queryNick(nickFromClarkClaim(auth.verifiedAuth.claims.params)),
          cleanNick: nickFromClarkClaim(auth.verifiedAuth.claims.params),
          params: auth.verifiedAuth.claims.params,
          used: now,
        };
        break;
      // case "device-id":
      //         queryProvider = {
      //   providerUserId: auth.userId,
      //   queryProvider: "device-id",
      //   queryEmail: queryEmail(auth.clerk.params.email),
      //   cleanEmail: auth.clerk.params.email,
      //   queryNick: queryNick(nickFromClarkClaim(auth.clerk.params)),
      //   cleanNick: nickFromClarkClaim(auth.clerk.params),
      //   params: auth.clerk.params,
      //   used: now,
      // };
      // break;
      default:
        return Result.Err(`unsupported auth type for ensureUser: ${auth.type}`);
    }
    await upsetUserByProvider(
      ctx.db,
      {
        userId,
        maxTenants: ctx.params.maxTenants,
        status: "active",
        statusReason: "just created",
        byProviders: [queryProvider],
      },
      now,
    );
    const authWithUserId: VerifiedAuthUserResult = {
      ...rAuth.Ok(),
      type: "VerifiedAuthUserResult",
      user: {
        userId,
        maxTenants: ctx.params.maxTenants,
      } as User,
    };
    const rTenant = await insertTenant(ctx, authWithUserId.user, {
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
    return ensureUser(ctx, req);
  }

  const user = auth.user;
  const rTenants = await listTenantsByUser(ctx, {
    type: "reqListTenantsByUser",
    auth,
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
    auth,
  });
  return Result.Ok({
    type: "resEnsureUser",
    user: user,
    tenants,
  });
}

export const ensureUserItem: EventoHandler<Request, ReqEnsureUser, ResEnsureUser> = {
  hash: "ensure-user",
  validate: (ctx) => validateEnsureUser(ctx.enRequest),
  handle: async (ctx: HandleTriggerCtx<Request, ReqEnsureUser, ResEnsureUser>): Promise<Result<EventoResultType>> => {
    const res = await ensureUser(ctx.ctx.getOrThrow("fpApiCtx"), ctx.validated);
    if (res.isErr()) {
      return Result.Err(res);
    }
    return wrapStop(ctx.send.send(ctx, res.Ok()));
  },
};

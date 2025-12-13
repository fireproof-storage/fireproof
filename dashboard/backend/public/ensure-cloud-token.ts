import { Result } from "@adviser/cement";
import { ReqEnsureCloudToken, ResEnsureCloudToken } from "@fireproof/core-protocols-dashboard";
import { FPCloudClaim } from "@fireproof/core-types-protocols-cloud";
import { eq, and, count } from "drizzle-orm";
import { sqlAppIdBinding } from "../sql/app-id-bind.js";
import { sqlLedgers, sqlLedgerUsers } from "../sql/ledgers.js";
import { sqlTenantUsers } from "../sql/tenants.js";
import { UserNotFoundError } from "../sql/users.js";
import { getFPTokenContext, createFPToken, toProvider } from "../utils/index.js";
import { FPApiSQLCtx, FPTokenContext } from "../types.js";
import { activeUser } from "../internal/auth.js";
import { ensureUser } from "./ensure-user.js";
import { createLedger } from "./create-ledger.js";
import { listLedgersByUser } from "./list-ledgers-by-user.js";

export async function ensureCloudToken(
  ctx: FPApiSQLCtx,
  req: ReqEnsureCloudToken,
  ictx: Partial<FPTokenContext> = {},
): Promise<Result<ResEnsureCloudToken>> {
  // Verify user authentication
  const rAuth = await activeUser(ctx, req);
  if (rAuth.isErr()) {
    return Result.Err(rAuth.Err());
  }
  const auth = rAuth.Ok();
  if (!auth.user) {
    return Result.Err(new UserNotFoundError());
  }
  const filters = [];
  if (req.ledger) {
    filters.push(eq(sqlLedgers.ledgerId, req.ledger));
  }
  if (req.tenant) {
    filters.push(eq(sqlLedgers.tenantId, req.tenant));
  }
  // test if binding exists
  const binding = await ctx.db
    .select()
    .from(sqlAppIdBinding)
    .innerJoin(sqlLedgers, and(eq(sqlLedgers.ledgerId, sqlAppIdBinding.ledgerId), ...filters))
    .innerJoin(
      sqlLedgerUsers,
      and(
        eq(sqlLedgerUsers.userId, auth.user.userId),
        eq(sqlLedgerUsers.ledgerId, sqlAppIdBinding.ledgerId),
        eq(sqlLedgerUsers.status, "active"),
      ),
    )
    .where(and(eq(sqlAppIdBinding.appId, req.appId), eq(sqlAppIdBinding.env, req.env ?? "prod")))
    .get();

  let ledgerId: string | undefined = undefined;
  let tenantId: string | undefined = undefined;
  if (!binding) {
    // First, check if ANY binding exists for this appId (another user may have created it)
    const existingAppBinding = await ctx.db
      .select()
      .from(sqlAppIdBinding)
      .innerJoin(sqlLedgers, eq(sqlLedgers.ledgerId, sqlAppIdBinding.ledgerId))
      .where(and(eq(sqlAppIdBinding.appId, req.appId), eq(sqlAppIdBinding.env, req.env ?? "prod")))
      .get();

    if (existingAppBinding) {
      // Helper to check user's ledger access
      const userId = auth.user.userId;
      const checkLedgerAccess = () =>
        ctx.db
          .select()
          .from(sqlLedgerUsers)
          .where(
            and(
              eq(sqlLedgerUsers.ledgerId, existingAppBinding.AppIdBinding.ledgerId),
              eq(sqlLedgerUsers.userId, userId),
              eq(sqlLedgerUsers.status, "active"),
            ),
          )
          .get();

      // Binding exists - verify user has access to this ledger
      let userAccess = await checkLedgerAccess();

      if (!userAccess) {
        // No direct access - ensureUser will redeem any pending invites
        await ensureUser(ctx, {
          type: "reqEnsureUser",
          auth: req.auth,
        });

        // Re-check access after ensureUser (which redeems invites)
        userAccess = await checkLedgerAccess();
      }

      if (userAccess) {
        ledgerId = existingAppBinding.Ledgers.ledgerId;
        tenantId = existingAppBinding.Ledgers.tenantId;
      } else {
        return Result.Err(`user does not have access to ledger for appId:${req.appId}`);
      }
    } else {
      // No existing binding - proceed with original logic to create one
      const rLedgerByUser = await listLedgersByUser(ctx, {
        type: "reqListLedgersByUser",
        auth: req.auth,
      });
      if (rLedgerByUser.isErr()) {
        return Result.Err(rLedgerByUser.Err());
      }
      const existingLedger = req.ledger ? rLedgerByUser.Ok().ledgers.find((l) => req.ledger === l.ledgerId) : undefined;
      if (existingLedger) {
        ledgerId = existingLedger.ledgerId;
        tenantId = existingLedger.tenantId;
      } else {
        if (req.ledger) {
          return Result.Err(`ledger ${req.ledger} not found for user`);
        }
        const rEnsureUser = await ensureUser(ctx, {
          type: "reqEnsureUser",
          auth: req.auth,
        });
        if (rEnsureUser.isErr()) {
          return Result.Err(rEnsureUser);
        }
        if (req.tenant) {
          tenantId = rEnsureUser.Ok().tenants.find((t) => t.tenantId === req.tenant && t.role === "admin")?.tenantId;
        } else {
          tenantId = rEnsureUser.Ok().tenants.find((t) => t.role === "admin" && t.default)?.tenantId;
        }
      }
    }
    if (!tenantId) {
      return Result.Err(`no tenant found for binding of appId:${req.appId} userId:${auth.user.userId}`);
    }
    if (!ledgerId) {
      const ledgerName = `${req.appId}-${auth.user.userId}`;

      // Check if ledger with this name already exists for this tenant
      const existingLedger = await ctx.db
        .select()
        .from(sqlLedgers)
        .where(and(eq(sqlLedgers.tenantId, tenantId), eq(sqlLedgers.name, ledgerName)))
        .get();

      if (existingLedger) {
        ledgerId = existingLedger.ledgerId;
      } else {
        // create ledger
        const rCreateLedger = await createLedger(ctx, {
          type: "reqCreateLedger",
          auth: req.auth,
          ledger: {
            tenantId,
            name: ledgerName,
          },
        });
        if (rCreateLedger.isErr()) {
          return Result.Err(rCreateLedger.Err());
        }
        ledgerId = rCreateLedger.Ok().ledger.ledgerId;
      }
    }
    const maxBindings = await ctx.db
      .select({
        total: count(sqlAppIdBinding.appId),
      })
      .from(sqlAppIdBinding)
      .where(eq(sqlAppIdBinding.appId, req.appId))
      .get();
    if (maxBindings && maxBindings.total >= ctx.params.maxAppIdBindings) {
      return Result.Err(`max appId bindings reached for appId:${req.appId}`);
    }
    await ctx.db
      .insert(sqlAppIdBinding)
      .values({
        appId: req.appId,
        env: req.env ?? "prod",
        ledgerId,
        tenantId,
        createdAt: new Date().toISOString(),
      })
      .onConflictDoNothing()
      .run();
  } else {
    ledgerId = binding.Ledgers.ledgerId;
    tenantId = binding.Ledgers.tenantId;
  }
  const rCtx = await getFPTokenContext(ctx.sthis, ictx);
  if (rCtx.isErr()) {
    return Result.Err(rCtx.Err());
  }
  const fpCtx = rCtx.Ok();

  // Get user's tenant access for JWT claim
  const tenantAccess = await ctx.db
    .select()
    .from(sqlTenantUsers)
    .where(
      and(eq(sqlTenantUsers.tenantId, tenantId), eq(sqlTenantUsers.userId, auth.user.userId), eq(sqlTenantUsers.status, "active")),
    )
    .get();

  // Get user's ledger access for JWT claim
  const ledgerAccess = await ctx.db
    .select()
    .from(sqlLedgerUsers)
    .where(
      and(eq(sqlLedgerUsers.ledgerId, ledgerId), eq(sqlLedgerUsers.userId, auth.user.userId), eq(sqlLedgerUsers.status, "active")),
    )
    .get();

  // Build tenants and ledgers arrays for JWT claim
  // These are required by the cloud service to validate access
  const tenants = tenantAccess ? [{ id: tenantId, role: tenantAccess.role as "admin" | "owner" | "member" }] : [];
  const ledgers = ledgerAccess
    ? [{ id: ledgerId, role: ledgerAccess.role as "admin" | "owner" | "member", right: ledgerAccess.right as "read" | "write" }]
    : [];

  const cloudToken = await createFPToken(fpCtx, {
    userId: auth.user.userId,
    tenants,
    ledgers,
    email: auth.verifiedAuth.params.email,
    nickname: auth.verifiedAuth.params.nick,
    provider: toProvider(auth.verifiedAuth),
    created: auth.user.createdAt,
    selected: {
      appId: req.appId,
      tenant: tenantId,
      ledger: ledgerId,
    },
  } satisfies FPCloudClaim);
  return Result.Ok({
    type: "resEnsureCloudToken",
    cloudToken: cloudToken.token,
    appId: req.appId,
    tenant: tenantId,
    ledger: ledgerId,
    expiresInSec: cloudToken.expiresInSec,
    expiresDate: cloudToken.expiresDate.toISOString(),
  });
}

import { Result } from "@adviser/cement";
import { DashAuthType, ReqEnsureCloudToken, ResEnsureCloudToken } from "@fireproof/core-protocols-dashboard";
import { FPCloudClaimSchema } from "@fireproof/core-types-protocols-cloud";
import { eq, and, count, like } from "drizzle-orm";
import { sqlAppIdBinding } from "../sql/app-id-bind.js";
import { sqlLedgers, sqlLedgerUsers } from "../sql/ledgers.js";
import { FPApiSQLCtx, FPTokenContext, ReqWithVerifiedAuthUser, VerifiedAuthUser } from "../types.js";
import { getFPTokenContext, createFPToken, toProvider } from "../utils/index.js";
import { createLedger } from "./create-ledger.js";
import { ensureUser } from "./ensure-user.js";
import { listLedgersByUser } from "./list-ledgers-by-user.js";
import { decodeJwt } from "jose";

function getAppIdBinding<T extends DashAuthType>(
  ctx: FPApiSQLCtx,
  auth: VerifiedAuthUser<T>,
  req: ReqWithVerifiedAuthUser<ReqEnsureCloudToken>,
  filters: ReturnType<typeof eq>[],
) {
  return ctx.db
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
}

export async function ensureCloudToken(
  ctx: FPApiSQLCtx,
  req: ReqWithVerifiedAuthUser<ReqEnsureCloudToken>,
  ictx: Partial<FPTokenContext> = {},
): Promise<Result<ResEnsureCloudToken>> {
  // Verify user authentication
  const filters: ReturnType<typeof eq>[] = [];
  if (req.ledger) {
    filters.push(eq(sqlLedgers.ledgerId, req.ledger));
  }
  if (req.tenant) {
    filters.push(eq(sqlLedgers.tenantId, req.tenant));
  }
  // test if binding exists
  const binding = await getAppIdBinding(ctx, req.auth, req, filters);
  let ledgerId: string | undefined = undefined;
  let tenantId: string | undefined = undefined;
  if (!binding) {
    const rLedgerByUser = await listLedgersByUser(ctx, {
      type: "reqListLedgersByUser",
      auth: req.auth,
    });
    if (rLedgerByUser.isErr()) {
      return Result.Err(rLedgerByUser);
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
        auth: req.auth.verifiedAuth,
      });
      if (rEnsureUser.isErr()) {
        return Result.Err(rEnsureUser);
      }
      if (req.tenant) {
        tenantId = rEnsureUser.Ok().tenants.find((t) => t.tenantId === req.tenant && t.role === "admin")?.tenantId;
      } else {
        tenantId = rEnsureUser.Ok().tenants.find((t) => t.role === "admin" && t.default)?.tenantId;
      }
      const binding = await getAppIdBinding(ctx, req.auth, req, filters);
      if (binding) {
        ledgerId = binding.Ledgers.ledgerId;
        tenantId = binding.Ledgers.tenantId;
      }
    }
    if (!tenantId) {
      return Result.Err(`no tenant found for binding of appId:${req.appId} userId:${req.auth.user.userId}`);
    }
    if (!ledgerId) {
      // Check if user has access to a ledger with name starting with appId (for shared/invited users)
      const sharedLedger = await ctx.db
        .select()
        .from(sqlLedgerUsers)
        .innerJoin(sqlLedgers, eq(sqlLedgers.ledgerId, sqlLedgerUsers.ledgerId))
        .where(
          and(
            eq(sqlLedgerUsers.userId, req.auth.user.userId),
            eq(sqlLedgerUsers.status, "active"),
            like(sqlLedgers.name, `${req.appId}%`),
          ),
        )
        .get();
      if (sharedLedger) {
        ledgerId = sharedLedger.Ledgers.ledgerId;
        tenantId = sharedLedger.Ledgers.tenantId;
      }
    }
    if (!ledgerId) {
      // create ledger
      const rCreateLedger = await createLedger(ctx, {
        type: "reqCreateLedger",
        auth: req.auth,
        ledger: {
          tenantId,
          name: `${req.appId}-${req.auth.user.userId}`,
        },
      });
      if (rCreateLedger.isErr()) {
        return Result.Err(rCreateLedger.Err());
      }
      ledgerId = rCreateLedger.Ok().ledger.ledgerId;
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
        .run();
    }
  } else {
    ledgerId = binding.Ledgers.ledgerId;
    tenantId = binding.Ledgers.tenantId;
  }
  const rCtx = await getFPTokenContext(ctx.sthis, ictx);
  if (rCtx.isErr()) {
    return Result.Err(rCtx.Err());
  }
  const fpCtx = rCtx.Ok();
  const cloudToken = await createFPToken(fpCtx, {
    userId: req.auth.user.userId,
    tenants: [],
    ledgers: [],
    email: req.auth.verifiedAuth.params.email,
    nickname: req.auth.verifiedAuth.params.nick,
    provider: toProvider(req.auth.verifiedAuth),
    created: req.auth.user.createdAt,
    selected: {
      appId: req.appId,
      tenant: tenantId,
      ledger: ledgerId,
    },
  });
  const claims = FPCloudClaimSchema.parse(decodeJwt(cloudToken.token));
  return Result.Ok({
    type: "resEnsureCloudToken",
    cloudToken: cloudToken.token,
    appId: req.appId,
    tenant: tenantId,
    ledger: ledgerId,
    expiresInSec: cloudToken.expiresInSec,
    expiresDate: cloudToken.expiresDate.toISOString(),
    claims,
  });
}

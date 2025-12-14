import { Result } from "@adviser/cement";
import { ReqCreateLedger, ResCreateLedger } from "@fireproof/core-protocols-dashboard";
import { and, eq, gt } from "drizzle-orm";
import { sqlLedgers, sqlLedgerUsers, sqlToLedgers } from "../sql/ledgers.js";
import { sqlTenants } from "../sql/tenants.js";
import { FPApiSQLCtx, ReqWithVerifiedAuthUser } from "../types.js";
import { isAdminOfTenant } from "../internal/is-admin-of-tenant.js";

export async function createLedger(
  ctx: FPApiSQLCtx,
  req: ReqWithVerifiedAuthUser<ReqCreateLedger>,
): Promise<Result<ResCreateLedger>> {
  // check if owner or admin of tenant
  if (!(await isAdminOfTenant(ctx, req.auth.user.userId, req.ledger.tenantId))) {
    return Result.Err("not owner or admin of tenant");
  }

  const allowed = await ctx.db
    .select()
    .from(sqlTenants)
    .where(
      and(
        eq(sqlTenants.tenantId, req.ledger.tenantId),
        gt(sqlTenants.maxLedgers, ctx.db.$count(sqlLedgers, eq(sqlLedgers.tenantId, req.ledger.tenantId))),
      ),
    )
    .get();
  if (!allowed) {
    return Result.Err("max ledgers per tenant reached");
  }

  const ledgerId = ctx.sthis.nextId(12).str;
  const now = new Date().toISOString();
  const ledger = await ctx.db
    .insert(sqlLedgers)
    .values({
      ledgerId,
      tenantId: req.ledger.tenantId,
      ownerId: req.auth.user.userId,
      name: req.ledger.name,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  const roles = await ctx.db
    .insert(sqlLedgerUsers)
    .values({
      ledgerId: ledgerId,
      userId: req.auth.user.userId,
      role: "admin",
      name: req.ledger.name,
      default: 0,
      right: "write",
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return Result.Ok({
    type: "resCreateLedger",
    ledger: sqlToLedgers([{ Ledgers: ledger[0], LedgerUsers: roles[0] }])[0],
  });
}

import { and, eq } from "drizzle-orm";
import { sqlLedgerUsers, sqlLedgers } from "../sql/ledgers.js";
import { FPApiSQLCtx } from "../types.js";
import { isAdminOfTenant } from "./is-admin-of-tenant.js";

export async function isAdminOfLedger(ctx: FPApiSQLCtx, userId: string, ledgerId: string): Promise<boolean> {
  const adminRole = await ctx.db
    .select()
    .from(sqlLedgerUsers)
    .innerJoin(sqlLedgers, and(eq(sqlLedgers.ledgerId, sqlLedgerUsers.ledgerId)))
    .where(and(eq(sqlLedgerUsers.userId, userId), eq(sqlLedgerUsers.ledgerId, ledgerId)))
    .get();
  if (adminRole?.LedgerUsers.role === "member") {
    return isAdminOfTenant(ctx, userId, adminRole.Ledgers.tenantId);
  }
  return adminRole?.LedgerUsers.role === "admin";
}

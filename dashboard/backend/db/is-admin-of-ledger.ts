import { and, eq } from "drizzle-orm";
import { sqlLedgerUsers, sqlLedgers } from "../ledgers.js";
import { BackendContext } from "./context.js";
import { isAdminOfTenant } from "./is-admin-of-tenant.js";

export async function isAdminOfLedger(bctx: BackendContext, userId: string, ledgerId: string): Promise<boolean> {
  const adminRole = await bctx.db
    .select()
    .from(sqlLedgerUsers)
    .innerJoin(sqlLedgers, and(eq(sqlLedgers.ledgerId, sqlLedgerUsers.ledgerId)))
    .where(and(eq(sqlLedgerUsers.userId, userId), eq(sqlLedgerUsers.ledgerId, ledgerId)))
    .get();
  if (adminRole?.LedgerUsers.role === "member") {
    return isAdminOfTenant(bctx, userId, adminRole.Ledgers.tenantId);
  }
  return adminRole?.LedgerUsers.role === "admin";
}

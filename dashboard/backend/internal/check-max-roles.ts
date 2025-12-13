import { Result } from "@adviser/cement";
import { and, eq } from "drizzle-orm";
import { sqlLedgers, sqlLedgerUsers } from "../sql/ledgers.js";
import { sqlTenants, sqlTenantUsers } from "../sql/tenants.js";
import { FPApiSQLCtx } from "../types.js";

export async function checkMaxRoles(
  { db }: FPApiSQLCtx,
  dbsqlTenant: typeof sqlTenants.$inferSelect,
  reqRole: string,
): Promise<Result<void>> {
  const tenantUsers = await db
    .select()
    .from(sqlTenantUsers)
    .where(and(eq(sqlTenantUsers.tenantId, dbsqlTenant.tenantId), eq(sqlTenantUsers.status, "active")))
    .all();
  const ledgerUsers = await db
    .select()
    .from(sqlLedgers)
    .innerJoin(sqlLedgerUsers, and(eq(sqlLedgerUsers.ledgerId, sqlLedgers.ledgerId), eq(sqlLedgerUsers.status, "active")))
    .where(eq(sqlLedgers.tenantId, dbsqlTenant.tenantId))
    .all();
  const adminUsers = new Set([
    ...tenantUsers.filter((tu) => tu.role === "admin"),
    ...ledgerUsers.filter((lu) => lu.LedgerUsers.role === "admin"),
  ]);
  const memberUsers = Array.from(
    new Set([...tenantUsers.filter((tu) => tu.role !== "admin"), ...ledgerUsers.filter((lu) => lu.LedgerUsers.role !== "admin")]),
  ).filter((u) => !adminUsers.has(u));
  if (reqRole === "admin") {
    if (adminUsers.size + 1 >= dbsqlTenant.maxAdminUsers) {
      return Result.Err("max admins reached");
    }
  }
  if (reqRole !== "admin") {
    if (memberUsers.length + 1 >= dbsqlTenant.maxMemberUsers) {
      return Result.Err("max members reached");
    }
  }
  return Result.Ok(undefined);
}

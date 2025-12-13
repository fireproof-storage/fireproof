import { and, eq } from "drizzle-orm";
import { sqlTenantUsers } from "../sql/tenants.js";
import { FPApiSQLCtx } from "../types.js";

export async function isAdminOfTenant({ db }: FPApiSQLCtx, userId: string, tenantId: string): Promise<boolean> {
  const adminRole = await db
    .select()
    .from(sqlTenantUsers)
    .where(
      and(
        eq(sqlTenantUsers.userId, userId),
        eq(sqlTenantUsers.tenantId, tenantId),
        eq(sqlTenantUsers.role, "admin"),
        eq(sqlTenantUsers.status, "active"),
      ),
    )
    .get();
  return !!adminRole;
}

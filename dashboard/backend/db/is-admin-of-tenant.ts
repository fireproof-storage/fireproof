import { and, eq } from "drizzle-orm";
import { sqlTenantUsers } from "../tenants.js";
import { BackendContext } from "./context.js";

export async function isAdminOfTenant(bctx: BackendContext, userId: string, tenantId: string): Promise<boolean> {
  const adminRole = await bctx.db
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

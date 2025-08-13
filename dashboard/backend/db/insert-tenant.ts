import { Result } from "@adviser/cement";
import { ActiveUserWithUserId, InCreateTenantParams, OutTenantParams, UserStatus } from "@fireproof/core-protocols-dashboard";
import { eq } from "drizzle-orm";
import { sqlTenants } from "../tenants.js";
import { BackendContext } from "./context.js";

export async function dbInsertTenant(
  bctx: BackendContext,
  auth: ActiveUserWithUserId,
  req: InCreateTenantParams,
): Promise<Result<OutTenantParams>> {
  const tenantId = bctx.sthis.nextId(12).str;
  const cnt = await bctx.db.$count(sqlTenants, eq(sqlTenants.ownerUserId, auth.user.userId));
  if (cnt + 1 >= auth.user.maxTenants) {
    return Result.Err("max tenants reached");
  }
  const nowStr = new Date().toISOString();
  const values = await bctx.db
    .insert(sqlTenants)
    .values({
      tenantId,
      name: req.name ?? `my-tenant[${tenantId}]`,
      ownerUserId: auth.user.userId,
      maxAdminUsers: req.maxAdminUsers ?? 5,
      maxMemberUsers: req.maxMemberUsers ?? 5,
      maxInvites: req.maxInvites ?? 10,
      createdAt: nowStr,
      updatedAt: nowStr,
    })
    .returning();
  return Result.Ok(sqlToOutTenantParams(values[0]));
}

export function sqlToOutTenantParams(sql: typeof sqlTenants.$inferSelect): OutTenantParams {
  return {
    tenantId: sql.tenantId,
    name: sql.name,
    ownerUserId: sql.ownerUserId,
    maxAdminUsers: sql.maxAdminUsers,
    maxMemberUsers: sql.maxMemberUsers,
    maxLedgers: sql.maxLedgers,
    maxInvites: sql.maxInvites,
    status: sql.status as UserStatus,
    statusReason: sql.statusReason,
    createdAt: new Date(sql.createdAt),
    updatedAt: new Date(sql.updatedAt),
  };
}

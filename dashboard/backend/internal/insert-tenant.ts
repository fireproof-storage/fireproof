import { Result } from "@adviser/cement";
import { InCreateTenantParams, FPApiParameters, OutTenantParams } from "@fireproof/core-protocols-dashboard";
import { eq } from "drizzle-orm";
import { sqlTenants } from "../sql/tenants.js";
import { FPApiSQLCtx, ActiveUserWithUserId } from "../types.js";
import { sqlToOutTenantParams } from "./sql-to-out-tenant-params.js";

export async function insertTenant(
  ctx: FPApiSQLCtx,
  auth: ActiveUserWithUserId,
  req: InCreateTenantParams & FPApiParameters,
): Promise<Result<OutTenantParams>> {
  const tenantId = ctx.sthis.nextId(12).str;
  const cnt = await ctx.db.$count(sqlTenants, eq(sqlTenants.ownerUserId, auth.user.userId));
  if (cnt + 1 >= auth.user.maxTenants) {
    return Result.Err("max tenants reached");
  }
  const nowStr = new Date().toISOString();
  const values = await ctx.db
    .insert(sqlTenants)
    .values({
      tenantId,
      name: req.name ?? `my-tenant[${tenantId}]`,
      ownerUserId: auth.user.userId,
      maxAdminUsers: req.maxAdminUsers,
      maxMemberUsers: req.maxMemberUsers,
      maxInvites: req.maxInvites,
      maxLedgers: req.maxLedgers,
      createdAt: nowStr,
      updatedAt: nowStr,
    })
    .returning();
  return Result.Ok(sqlToOutTenantParams(values[0]));
}

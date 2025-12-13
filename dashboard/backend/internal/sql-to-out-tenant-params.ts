import { OutTenantParams, UserStatus } from "@fireproof/core-protocols-dashboard";
import { sqlTenants } from "../sql/tenants.js";

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

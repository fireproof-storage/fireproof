import { UserTenant } from "../backend/api.ts";

export function truncateDbName(name: string, maxLength: number) {
  if (name.length <= maxLength) return name;
  return `${name.substring(0, maxLength - 3)}...`;
}

export function tenantName(tenant: UserTenant) {
  // if (tenant.default) {
  //   return "Default";
  // }
  return tenant.user.name || tenant.tenant.name || tenant.tenantId;
}

export const DEFAULT_ENDPOINT = "fireproof://cloud.fireproof.direct?getBaseUrl=https://storage.fireproof.direct/";
export const SYNC_DB_NAME = "fp_sync";

export const API_URL = import.meta.env.VITE_API_URL ?? "/api";

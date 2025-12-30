import { BuildURI } from "@adviser/cement";
import { LedgerUser, UserTenant } from "@fireproof/core-protocols-dashboard";

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

export function ledgerName(ledger: LedgerUser) {
  // if (tenant.default) {
  //   return "Default";
  // }
  return ledger.name;
}

export const DEFAULT_ENDPOINT = BuildURI.from("fireproof://cloud.fireproof.direct")
  .setParam("getBaseUrl", "https://storage.fireproof.direct/")
  .URI();
export const SYNC_DB_NAME = "fp_sync";

export const DASHAPI_URL = import.meta.env.VITE_DASHAPI_URL ?? "/api";

/**
 * Default timeout for query execution in milliseconds.
 * Configurable via VITE_QUERY_TIMEOUT environment variable.
 * @default 30000 (30 seconds)
 */
export const QUERY_TIMEOUT_MS = import.meta.env.VITE_QUERY_TIMEOUT
  ? parseInt(import.meta.env.VITE_QUERY_TIMEOUT as string, 10)
  : 30000;

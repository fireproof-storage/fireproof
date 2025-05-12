import { BuildURI, URI } from "@adviser/cement";
import { ps } from "@fireproof/core";

export function truncateDbName(name: string, maxLength: number) {
  if (name.length <= maxLength) return name;
  return `${name.substring(0, maxLength - 3)}...`;
}

export function tenantName(tenant: ps.dashboard.UserTenant) {
  // if (tenant.default) {
  //   return "Default";
  // }
  return tenant.user.name || tenant.tenant.name || tenant.tenantId;
}

export function ledgerName(ledger: ps.dashboard.LedgerUser) {
  // if (tenant.default) {
  //   return "Default";
  // }
  return ledger.name;
}

export const DEFAULT_ENDPOINT = BuildURI.from("fireproof://cloud.fireproof.direct")
  .setParam("getBaseUrl", "https://storage.fireproof.direct/")
  .URI();
export const SYNC_DB_NAME = "fp_sync";

export const API_URL = import.meta.env.VITE_API_URL ?? "/api";

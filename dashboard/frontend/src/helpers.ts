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
 * Set to 0 to disable timeouts.
 * @default 30000 (30 seconds)
 */
/** Default timeout when no override is provided. */
const DEFAULT_QUERY_TIMEOUT_MS = 30000;
/** Raw VITE_QUERY_TIMEOUT value, if provided. */
const QUERY_TIMEOUT_ENV = import.meta.env.VITE_QUERY_TIMEOUT as string | undefined;
/** Parsed timeout override, NaN if invalid. */
const PARSED_QUERY_TIMEOUT = QUERY_TIMEOUT_ENV !== undefined ? parseInt(QUERY_TIMEOUT_ENV, 10) : Number.NaN;

export const QUERY_TIMEOUT_MS =
  QUERY_TIMEOUT_ENV === undefined || QUERY_TIMEOUT_ENV === ""
    ? DEFAULT_QUERY_TIMEOUT_MS
    : Number.isFinite(PARSED_QUERY_TIMEOUT) && PARSED_QUERY_TIMEOUT >= 0
      ? PARSED_QUERY_TIMEOUT
      : DEFAULT_QUERY_TIMEOUT_MS;

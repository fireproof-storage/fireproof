import { SuperThis } from "@fireproof/core-types-base";
import { FPApiParameters } from "@fireproof/core-types-protocols-dashboard";
import { DashSqlite } from "./create-handler.js";
import { FPApiSQLCtx, FPApiToken } from "./types.js";
import { ensureLogger } from "@fireproof/core-runtime";
import { DeviceIdCAIf } from "@fireproof/core-types-device-id";

export function createFPApiSQLCtx(
  sthis: SuperThis,
  db: DashSqlite,
  tokenApi: Record<string, FPApiToken>,
  deviceCA: DeviceIdCAIf,
  params: FPApiParameters,
): FPApiSQLCtx {
  const logger = ensureLogger(sthis, "FPApiSQLCtx");
  return {
    db: db,
    tokenApi: tokenApi,
    sthis: sthis,
    logger: logger,
    params: params,
    deviceCA,
  };
}

import { SuperThis } from "@fireproof/core";
import { DashSqlite } from "../create-handler.js";
import { Logger } from "@adviser/cement";

export interface BackendContext {
  readonly sthis: SuperThis;
  readonly logger: Logger;
  readonly db: DashSqlite;
}

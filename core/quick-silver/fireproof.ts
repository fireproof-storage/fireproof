import { KeyedResolvOnce } from "@adviser/cement";
import { ensureSuperThis } from "@fireproof/core-runtime";
import type { Database } from "@fireproof/core-types-base";
import type { QSConfigOpts } from "./types.js";
import { QuickSilver } from "./quick-silver.js";

const databasesByName = new KeyedResolvOnce<Database>();

export function fireproof(name: string, opts?: QSConfigOpts): Database {
  return databasesByName.get(name).once(() => new QuickSilver({ sthis: opts?.sthis ?? ensureSuperThis(), name }));
}

import { URI } from "@adviser/cement";
/// import { Level } from "level";
// import { FPSyncEntry, FPSyncProtocol } from "@fireproof/core-types-protocols-sync";
import { SuperThis } from "@fireproof/core-types-base";
import { FPIndexedDB } from "@fireproof/core-types-blockstore";
import { FPIndexedDBImpl } from "./fp-db.js";

export async function indexeddbFPIndexedDB(_sthis: SuperThis, uri: URI): Promise<FPIndexedDB> {
  return Promise.resolve(new FPIndexedDBImpl(uri));
}

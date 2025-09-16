import { URI } from "@adviser/cement";
import { MemoryLevel } from "memory-level";
import { FPSyncEntry, FPSyncProtocol } from "@fireproof/core-types-protocols-sync";
import { SuperThis } from "@fireproof/core-types-base";

export async function memoryFPSync(_sthis: SuperThis, _uri: URI): Promise<FPSyncProtocol<Buffer|Uint8Array|string>> {
  return new MemoryLevel<string, FPSyncEntry>();
}

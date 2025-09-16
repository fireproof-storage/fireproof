import { URI } from "@adviser/cement";
/// import { Level } from "level";
import { FPSyncEntry, FPSyncProtocol } from "@fireproof/core-types-protocols-sync";
import { SuperThis } from "@fireproof/core-types-base";
import { sleep } from "@fireproof/core-runtime";

export async function indexedDBFPSync(_sthis: SuperThis, uri: URI): Promise<FPSyncProtocol<Uint8Array>> {
  console.log("indexedDBFPSync-0", uri.toString(), window.location.href);
  await sleep(10000000);
  //const x = await import("https://esm.sh/browser-level@3.0.0");
// import { BrowserLevel } from "browser-level";
  console.log("indexedDBFPSync-1", uri.toString());
  // const bl = new x.BrowserLevel<string, FPSyncEntry>("xxxx")
  //console.log("indexedDBFPSync", bl);
throw new Error("xxxx");
//  return bl;
}

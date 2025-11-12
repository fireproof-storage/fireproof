import { hashObjectSync } from "@fireproof/core-runtime";
import { FPCCReqRegisterLocalDbName } from "./protocol-fp-cloud-conn.js";

export * from "./convert-to-token-and-claims.js";
export * from "./fpcc-protocol.js";
export * from "./post-messager.js";
export * from "./protocol-fp-cloud-conn.js";

// export interface DbKey {
//   readonly appId: string;
//   readonly dbName: string;
// }

export function dbAppKey(o: FPCCReqRegisterLocalDbName): string {
  return hashObjectSync(o);
  //o.appId + ":" + o.dbName;
}

export function isInIframe(
  win: {
    readonly self: Window | null;
    readonly top: Window | null;
  } = window,
): boolean {
  try {
    return win.self !== win.top;
  } catch (e) {
    // If we can't access window.top due to cross-origin restrictions,
    // we're definitely in an iframe
    return true;
  }
}

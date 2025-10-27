export * from "./convert-to-token-and-claims.js";
export * from "./fpcc-protocol.js";
export * from "./post-messager.js";
export * from "./protocol-fp-cloud-conn.js";

export interface DbKey {
  readonly appId: string;
  readonly dbName: string;
}

export function dbAppKey(o: DbKey): string {
  return o.appId + ":" + o.dbName;
}

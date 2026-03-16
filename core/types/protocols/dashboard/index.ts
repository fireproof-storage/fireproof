export * from "./dash-types.js";
export * from "./fp-api-interface.js";
export * from "./msg-is.js";
export * from "./msg-types.js";

export * from "./token.js";
export interface FPTokenContext {
  readonly secretToken: string;
  readonly publicToken: string;
  readonly issuer: string;
  readonly audience: string;
  readonly validFor: number; // seconds
  readonly extendValidFor: number; // seconds
}

import { Result } from "@adviser/cement";
import { DashAuthType, User } from "./msg-types.js";
import { ClerkClaim } from "@fireproof/core-types-base";

export interface TokenByResultIdParam {
  readonly status: "found" | "not-found";
  readonly resultId: string;
  readonly token?: string; // JWT
  readonly now: Date;
}

// export const FPAPIMsg = new FAPIMsgImpl();

export interface FPApiToken {
  verify(token: string): Promise<Result<VerifiedClaimsResult>>;
}

export interface WithAuth {
  readonly auth: DashAuthType;
}

// export interface WithVerifiedAuth<T extends DashAuthType> {
//   readonly verifiedAuth: T;
// }
export interface VerifiedClaimsResult {
  readonly type: DashAuthType["type"];
  readonly token: string;
  readonly claims: unknown;
}

export interface ClerkVerifiedAuth {
  readonly type: "clerk";
  readonly claims: ClerkClaim;
}

export interface VerifiedAuthResult {
  readonly type: "VerifiedAuthResult";
  readonly inDashAuth: DashAuthType; // thats the original auth used to verify
  readonly verifiedAuth: ClerkVerifiedAuth;
}

export interface VerifiedAuthUserResult extends Omit<VerifiedAuthResult, "type"> {
  readonly type: "VerifiedAuthUserResult";
  // This is the user record from our DB
  readonly user: User;
}

export type VerifiedResult = VerifiedAuthResult | VerifiedAuthUserResult;

export function isVerifiedAuth(obj: VerifiedResult): obj is VerifiedAuthResult {
  return (obj as VerifiedAuthResult).type === "VerifiedAuthResult";
}

export function isVerifiedAuthUser(obj: VerifiedResult): obj is VerifiedAuthUserResult {
  return (obj as VerifiedAuthUserResult).type === "VerifiedAuthUserResult";
}

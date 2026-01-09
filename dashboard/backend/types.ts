import { Logger, Result } from "@adviser/cement";
import { UserStatus, DashAuthType, User, FPApiParameters } from "@fireproof/core-types-protocols-dashboard";
import { ClerkClaim, SuperThis } from "@fireproof/core-types-base";
import { Role, ReadWrite } from "@fireproof/core-types-protocols-cloud";
import { DashSqlite } from "./create-handler.js";
import { DeviceIdCAIf } from "@fireproof/core-types-device-id";

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

export interface AddUserToTenant {
  readonly userName?: string;
  readonly tenantName?: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly default?: boolean;
  readonly role: Role;
  readonly status?: UserStatus;
  readonly statusReason?: string;
}

export interface AddUserToLedger {
  readonly userName?: string;
  readonly ledgerName?: string;
  readonly ledgerId: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly default?: boolean;
  readonly status?: UserStatus;
  readonly statusReason?: string;
  readonly role: Role;
  readonly right: ReadWrite;
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
//   return (obj as VerifiedAuthUser<T>).user !== undefined;
// }

// export type ActiveUser<T extends DashAuthType = ClerkVerifyAuth> = WithVerifiedAuth<T> | VerifiedAuthUser<T>;

export type ReqWithVerifiedAuthUser<REQ extends { type: string; auth: DashAuthType }> = Omit<REQ, "auth"> & {
  readonly auth: VerifiedAuthUserResult;
};

// export type ActiveUserWithUserId<T extends DashAuthType = ClerkVerifyAuth> = Omit<ActiveUser<T>, "user"> & {
//   user: {
//     userId: string;
//     maxTenants: number;
//   };
// };

export interface FPTokenContext {
  readonly secretToken: string;
  readonly publicToken: string;
  readonly issuer: string;
  readonly audience: string;
  readonly validFor: number; // seconds
  readonly extendValidFor: number; // seconds
}

export interface FPApiSQLCtx {
  readonly db: DashSqlite;
  readonly logger: Logger;
  readonly tokenApi: Record<string, FPApiToken>;
  readonly sthis: SuperThis;
  readonly params: FPApiParameters;
  readonly deviceCA: DeviceIdCAIf;
}

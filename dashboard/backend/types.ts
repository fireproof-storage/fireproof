import { Result } from "@adviser/cement";
import { DeviceIdCA } from "@fireproof/core-device-id";
import {
  FAPIMsgImpl,
  VerifiedAuth,
  UserStatus,
  DashAuthType,
  ClerkVerifyAuth,
  User,
  FPApiParameters,
} from "@fireproof/core-protocols-dashboard";
import { SuperThis } from "@fireproof/core-types-base";
import { Role, ReadWrite } from "@fireproof/core-types-protocols-cloud";
import { DashSqlite } from "./create-handler.js";

export interface TokenByResultIdParam {
  readonly status: "found" | "not-found";
  readonly resultId: string;
  readonly token?: string; // JWT
  readonly now: Date;
}

export const FPAPIMsg = new FAPIMsgImpl();

export interface FPApiToken {
  verify(token: string, clerkId?: string): Promise<Result<VerifiedAuth>>;
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

export interface WithVerifiedAuth<T extends DashAuthType> {
  readonly verifiedAuth: T;
}

export interface VerifiedAuthUser<T extends DashAuthType> extends WithVerifiedAuth<T> {
  readonly user: User;
}

export function isVerifiedUserActive<T extends DashAuthType>(obj: ActiveUser<T>): obj is VerifiedAuthUser<T> {
  return (obj as VerifiedAuthUser<T>).user !== undefined;
}

export type ActiveUser<T extends DashAuthType = ClerkVerifyAuth> = WithVerifiedAuth<T> | VerifiedAuthUser<T>;

export type ReqWithVerifiedAuthUser<
  REQ extends { type: string; auth: DashAuthType },
  T extends DashAuthType = ClerkVerifyAuth,
> = Omit<REQ, "auth"> & {
  readonly auth: VerifiedAuthUser<T>;
};

export type ActiveUserWithUserId<T extends DashAuthType = ClerkVerifyAuth> = Omit<ActiveUser<T>, "user"> & {
  user: {
    userId: string;
    maxTenants: number;
  };
};

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
  readonly tokenApi: Record<string, FPApiToken>;
  readonly sthis: SuperThis;
  readonly params: FPApiParameters;
  readonly deviceCA: DeviceIdCA;
}

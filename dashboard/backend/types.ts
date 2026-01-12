import { Logger } from "@adviser/cement";
import {
  UserStatus,
  DashAuthType,
  FPApiParameters,
  VerifiedAuthUserResult,
  FPApiToken,
} from "@fireproof/core-types-protocols-dashboard";
import { SuperThis } from "@fireproof/core-types-base";
import { Role, ReadWrite } from "@fireproof/core-types-protocols-cloud";
import { DashSqlite } from "./create-handler.js";
import { DeviceIdCAIf } from "@fireproof/core-types-device-id";

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

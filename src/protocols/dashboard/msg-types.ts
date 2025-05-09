import { ReadWrite, Role, TenantLedger } from "../cloud/msg-types.js";

export type AuthProvider = "github" | "google" | "fp" | "invite-per-email";

export interface Queryable {
  readonly userId?: string;
  readonly queryProvider?: AuthProvider;
  readonly queryEmail?: string;
  readonly queryNick?: string;
}

export interface QueryUser {
  readonly byString?: string; // could be email or nick or exact userId
  readonly existingUserId?: string;
  readonly byEmail?: string; // exact email
  readonly byNick?: string; // exact nick
  readonly andProvider?: AuthProvider;
}

export interface Tenant {
  readonly tenantId: string;
  readonly name: string;
  readonly ownerUserId: string;
  readonly adminUserIds: string[];
  readonly memberUserIds: string[];
  readonly maxAdminUsers: number;
  readonly maxMemberUsers: number;
  readonly maxLedgers: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export type InviteTicketStatus = "pending" | "accepted" | "rejected" | "expired";

export interface SqlInvitedParams {
  readonly tenant?: {
    readonly role: "admin" | "member";
  };
  readonly ledger?: {
    readonly role: "admin" | "member";
    readonly right: "read" | "write";
  };
}

export interface InvitedParams {
  readonly tenant?: SqlInvitedParams["tenant"] & { readonly id: string };
  readonly ledger?: SqlInvitedParams["ledger"] & { readonly id: string };
}

export interface InviteTicket {
  readonly inviteId: string;
  readonly sendEmailCount: number;
  readonly inviterUserId: string;

  readonly query: QueryUser;
  // readonly userID?: string;
  // readonly queryProvider?: AuthProvider;
  // readonly queryEmail?: string;
  // readonly queryNick?: string;

  readonly status: InviteTicketStatus;
  readonly statusReason: string;
  readonly invitedUserId?: string;
  readonly invitedParams: InvitedParams;

  readonly expiresAfter: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export type UserStatus = "active" | "inactive" | "banned" | "invited";

export interface AuthType {
  readonly type: "ucan" | "clerk" | "better";
  readonly token: string;
}

export interface VerifiedAuth {
  readonly type: "clerk" | "better";
  readonly token: string;
  readonly userId: string;
  readonly provider: string;
}

export interface ClerkClaim {
  readonly email: string;
  readonly first: string;
  readonly last: string;
  // github handle
  readonly nick?: string;
  readonly name?: string;
  readonly image_url?: string;
}

export interface ClerkVerifyAuth extends VerifiedAuth {
  readonly params: ClerkClaim;
}

export interface User {
  readonly userId: string;
  readonly maxTenants: number;
  readonly status: UserStatus;
  readonly statusReason?: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly byProviders: UserByProvider[];
}

export interface UserByProvider extends Queryable {
  readonly providerUserId: string;
  readonly cleanEmail?: string;
  readonly cleanNick?: string;
  readonly queryProvider: AuthProvider;
  readonly queryEmail?: string;
  readonly queryNick?: string;
  readonly params: ClerkClaim;
  readonly used: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ResCreateTenant {
  readonly type: "resCreateTenant";
  readonly tenant: OutTenantParams;
}

export interface InCreateTenantParams {
  readonly name?: string;
  readonly ownerUserId: string;
  readonly maxAdminUsers?: number;
  readonly maxMemberUsers?: number;
  readonly maxInvites?: number;
}

export interface ReqCreateTenant {
  readonly type: "reqCreateTenant";
  readonly auth: AuthType;
  readonly tenant: Omit<InCreateTenantParams, "ownerUserId">;
}

export interface InUpdateTenantParams {
  readonly tenantId: string;
  readonly name?: string;
  readonly maxAdminUsers?: number;
  readonly maxMemberUsers?: number;
  readonly maxInvites?: number;
}

export interface ResUpdateTenant {
  readonly type: "resUpdateTenant";
  readonly tenant: OutTenantParams;
}

export interface ReqUpdateTenant {
  readonly type: "reqUpdateTenant";
  readonly auth: AuthType;
  readonly tenant: InUpdateTenantParams;
}

export interface ResEnsureTenant {
  readonly type: "resEnsureTenant";
  readonly tenant: Tenant;
}

export interface ReqRedeemInvite {
  readonly type: "reqRedeemInvite";
  readonly auth: AuthType;
  // readonly query: QueryUser;
}

export interface ResRedeemInvite {
  readonly type: "resRedeemInvite";
  readonly invites?: InviteTicket[];
}

export interface ReqListLedgersByUser {
  readonly type: "reqListLedgersByUser";
  readonly auth: AuthType;
  readonly tenantIds?: string[];
}

interface LedgerUserRight {
  readonly userId: string;
  readonly role: Role;
  readonly right: ReadWrite;
  readonly name?: string;
  readonly default: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface LedgerUser {
  readonly ledgerId: string;
  readonly tenantId: string;
  readonly name: string;
  readonly ownerId: string;
  readonly maxShares: number;
  readonly users: LedgerUserRight[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ResListLedgersByUser {
  readonly type: "resListLedgersByUser";
  readonly userId: string;
  readonly ledgers: LedgerUser[];
}

// export interface ReqAttachUserToLedger {
//   readonly type: "reqAttachUserToLedger";
//   readonly auth: AuthType;
//   readonly tenantId: string;
//   readonly ledgerId: string;
//   readonly userId: string;
//   readonly role: ReadWrite;
// }

// export interface ResAttachUserToLedger {
//   readonly type: "resAttachUserToLedger";
//   readonly tenantId: string;
//   readonly ledgerId: string;
//   readonly userId: string;
//   readonly role: ReadWrite;
// }

export interface ReqListTenantsByUser {
  readonly type: "reqListTenantsByUser";
  readonly auth: AuthType;
}

export interface UserTenantCommon {
  readonly name?: string;
  readonly status: UserStatus;
  readonly statusReason: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface UserTenant {
  readonly tenantId: string;
  readonly role: Role;
  readonly default: boolean;
  readonly user: UserTenantCommon;
  readonly tenant: UserTenantCommon;
}

export function isAdmin(ut: UserTenant) {
  return ut.role === "admin";
}

export interface AdminTenant extends UserTenant {
  readonly role: "admin"; // | "owner";
  readonly adminUserIds: string[];
  readonly memberUserIds: string[];
  readonly maxAdminUsers: number;
  readonly maxMemberUsers: number;
}

export interface ResListTenantsByUser {
  readonly type: "resListTenantsByUser";
  readonly userId: string;
  readonly authUserId: string;
  readonly tenants: UserTenant[];
}

// export type AuthProvider = "github" | "google" | "fp";

export interface ReqFindUser {
  readonly type: "reqFindUser";
  readonly auth: AuthType;
  readonly query: QueryUser;
}

// export interface QueryResultUser {
//   readonly userId: string;
//   readonly authProvider: AuthProvider;
//   readonly email?: string;
//   readonly nick?: string;
//   readonly status: UserStatus;
//   readonly createdAt: Date;
//   readonly updatedAt: Date;
// }

export interface ResFindUser {
  readonly type: "resFindUser";
  // readonly userId: string;
  // readonly authUserId: string;
  readonly query: QueryUser;
  readonly results: User[];
}

export interface QueryInviteTicket {
  readonly incSendEmailCount?: boolean;

  // indicate update or insert
  readonly inviteId?: string;
  readonly query: QueryUser;

  // readonly invitedTenantId?: string;
  // readonly invitedLedgerId?: string;
  readonly invitedParams: InvitedParams;
}

export interface ReqInviteUser {
  readonly type: "reqInviteUser";
  readonly auth: AuthType;
  readonly ticket: QueryInviteTicket; // InviteTicket & { readonly incSendEmailCount?: boolean }
}

export interface ResInviteUser {
  readonly type: "resInviteUser";
  readonly invite: InviteTicket;
}

export interface ReqDeleteInvite {
  readonly type: "reqDeleteInvite";
  readonly auth: AuthType;
  readonly inviteId: string;
}

export interface ResDeleteInvite {
  readonly type: "resDeleteInvite";
  readonly inviteId: string;
}

export interface ReqListInvites {
  readonly type: "reqListInvites";
  readonly auth: AuthType;
  // if set all invites for the given tenants are listed
  // if not set all invites for the user are listed
  readonly tenantIds?: string[];
  readonly ledgerIds?: string[];
}

export interface ResListInvites {
  readonly type: "resListInvites";
  readonly tickets: InviteTicket[];
}

export interface ReqUpdateUserTenant {
  readonly type: "reqUpdateUserTenant";
  readonly auth: AuthType;
  readonly tenantId: string;
  readonly userId?: string;
  readonly role: Role; // only if admin
  readonly default?: boolean;
  readonly name?: string;
}

export interface ResUpdateUserTenant {
  readonly type: "resUpdateUserTenant";
  readonly tenantId: string;
  readonly userId: string;
  readonly role: Role;
  readonly default: boolean;
  readonly name?: string;
}

export interface CreateLedger {
  readonly tenantId: string;
  readonly name: string;
}

export interface ReqCreateLedger {
  readonly type: "reqCreateLedger";
  readonly auth: AuthType;
  readonly ledger: CreateLedger;
}

export interface ResCreateLedger {
  readonly type: "resCreateLedger";
  readonly ledger: LedgerUser;
}

export interface UpdateLedger {
  readonly ledgerId: string;
  readonly tenantId: string;
  readonly right?: ReadWrite;
  readonly role?: Role;
  readonly name?: string;
  readonly default?: boolean;
}

export interface ReqUpdateLedger {
  readonly type: "reqUpdateLedger";
  readonly auth: AuthType;
  readonly ledger: UpdateLedger;
}
export interface ResUpdateLedger {
  readonly type: "resUpdateLedger";
  readonly ledger: LedgerUser;
}

export interface DeleteLedger {
  readonly ledgerId: string;
  readonly tenantId: string;
}

export interface ReqDeleteLedger {
  readonly type: "reqDeleteLedger";
  readonly auth: AuthType;
  readonly ledger: DeleteLedger;
}
export interface ResDeleteLedger {
  readonly type: "resDeleteLedger";
}

export interface ReqCloudSessionToken {
  readonly type: "reqCloudSessionToken";
  readonly auth: AuthType;
  readonly selected?: Partial<TenantLedger>;
  readonly resultId?: string;
}

export interface ResCloudSessionToken {
  readonly type: "resCloudSessionToken";
  readonly token: string; // JWT
}

export interface ReqTokenByResultId {
  readonly type: "reqTokenByResultId";
  readonly resultId: string;
}

export interface ResTokenByResultId {
  readonly type: "resTokenByResultId";
  readonly status: "found" | "not-found";
  readonly resultId: string;
  readonly token?: string; // JWT
}

export interface ResDeleteTenant {
  readonly type: "resDeleteTenant";
  readonly tenantId: string;
}

export interface ReqDeleteTenant {
  readonly type: "reqDeleteTenant";
  readonly auth: AuthType;
  readonly tenantId: string;
}

export interface OutTenantParams {
  readonly tenantId: string;
  readonly name: string;
  readonly ownerUserId: string;
  readonly maxAdminUsers: number;
  readonly maxMemberUsers: number;
  readonly maxInvites: number;
  readonly maxLedgers: number;
  readonly status: UserStatus;
  readonly statusReason: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ResEnsureUser {
  readonly type: "resEnsureUser";
  readonly user: User;
  readonly tenants: UserTenant[];
}

export interface ReqEnsureUser {
  readonly type: "reqEnsureUser";
  readonly auth: AuthType;
}

interface RoleBase {
  readonly tenantId?: string;
  readonly ledgerId?: string;
  readonly userId: string;
  readonly role: Role;
  readonly adminUserIds: string[];
  readonly memberUserIds: string[];
}

interface TenantRole extends RoleBase {
  readonly tenantId: string;
}

interface LedgerRole extends RoleBase {
  readonly ledgerId: string;
  readonly right: ReadWrite;
}

export type RoleType = TenantRole | LedgerRole;

export interface ReqInsertTenant {
  readonly tenantId: string;
  readonly name?: string;
  readonly ownerUserId: string;
  readonly adminUserIds?: string[];
  readonly memberUserIds?: string[];
  readonly maxAdminUsers?: number;
  readonly maxMemberUsers?: number;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}

import { Result } from "@adviser/cement";
import { SuperThis } from "@fireproof/core";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import type { SQLiteTransaction } from "drizzle-orm/sqlite-core";
import type { ResultSet } from "@libsql/client";
import { type ExtractTablesWithRelations } from "drizzle-orm";
import { eq, and, inArray, gt, lt, ne } from "drizzle-orm/expressions";
import {
  AuthType,
  UserStatus as UserStatus,
  User,
  ClerkVerifyAuth,
  getUser,
  isUserNotFound,
  upsetUserByProvider,
  UserNotFoundError,
  queryUser,
  VerifiedAuth,
  ClerkClaim,
} from "./users.ts";
import { Tenant, sqlTenants, sqlTenantUsers, sqlTenantUserRoles } from "./tenants.ts";
import { InviteTicket, sqlInviteTickets, sqlToInvite, prepareInviteTicket, InvitedParams } from "./invites.ts";
import { queryCondition, queryEmail, queryNick, QueryUser, toBoolean, toUndef } from "./sql-helper.ts";

export interface ReqEnsureUser {
  readonly type: "reqEnsureUser";
  readonly auth: AuthType;
}

// export interface TenantUser {
//     readonly userId: string;
//     readonly tenantId: string;
//     readonly name: string;
//     readonly active: boolean; // active for this user
// }

export interface ResEnsureUser {
  readonly type: "resEnsureUser";
  readonly user: User;
  readonly tenants: UserTenant[];
}

// export interface Tenant {
//   readonly tenantId: string;
//   readonly name: string;
//   readonly ownerUserId: string;
//   // null means don't change
//   readonly adminUserIds?: string[];
//   readonly memberUserIds?: string[];
//   readonly maxAdminUsers?: number;
//   readonly maxMemberUsers?: number;
// }

// export interface ReqEnsureTenant {
//   readonly type: "reqEnsureTenant";
//   readonly auth: AuthType;
//   readonly tenant: Omit<InsertTenantParam, "tenantId"> & { readonly tenantId?: string };
// }

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
  readonly status: UserStatus;
  readonly statusReason: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

function sqlToOutTenantParams(sql: typeof sqlTenants.$inferSelect): OutTenantParams {
  return {
    tenantId: sql.tenantId,
    name: sql.name,
    ownerUserId: sql.ownerUserId,
    maxAdminUsers: sql.maxAdminUsers,
    maxMemberUsers: sql.maxMemberUsers,
    maxInvites: sql.maxInvites,
    status: sql.status as UserStatus,
    statusReason: sql.statusReason,
    createdAt: new Date(sql.createdAt),
    updatedAt: new Date(sql.updatedAt),
  };
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

export interface ReqConnectUserToTenant {
  readonly type: "reqConnectUserToTenant";
  readonly auth: AuthType;
  readonly name: string;
  readonly tenantId: string;
  readonly inviteId: string;
}

export interface ResConnectUserToTenant {
  readonly type: "resConnectUserToTenant";
  readonly name: string;
  readonly tenant: OutTenantParams;
  readonly userId: string;
  readonly role: "admin" | "member";
}

export interface ReqListLedgerByTenant {
  readonly type: "reqListLedgerByTenant";
  readonly auth: AuthType;
  readonly tenantId: string;
}

export interface Ledger {
  readonly ledgerId: string;
  readonly tenantId: string;
  readonly name: string;
  readonly ownerRefId: string;
  readonly readRefIds: string[];
  readonly writeRefIds: string[];
  readonly createdAt: Date;
}

export interface ResListLedgerByTenant {
  readonly type: "resListLedgerByTenant";
  readonly tenantId: string;
  readonly userId: string;
  readonly ledgers: Ledger[];
}

export interface ReqAttachUserToLedger {
  readonly type: "reqAttachUserToLedger";
  readonly auth: AuthType;
  readonly tenantId: string;
  readonly ledgerId: string;
  readonly userId: string;
  readonly role: "read" | "write";
}

export interface ResAttachUserToLedger {
  readonly type: "resAttachUserToLedger";
  readonly tenantId: string;
  readonly ledgerId: string;
  readonly userId: string;
  readonly role: "read" | "write";
}

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

export interface OwnerTenant extends UserTenant {
  readonly role: "admin" | "owner";
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

  // readonly inviterUserId: string;
  readonly inviterTenantId: string;

  // indicate update or insert
  readonly inviteId?: string;

  readonly query: QueryUser;
  // // readonly invitedUserId?: string;
  // readonly userID?: string;

  // readonly queryProvider?: AuthProvider;
  // readonly queryEmail?: string;
  // readonly queryNick?: string;

  // readonly invitedTenantId?: string;
  // readonly invitedLedgerId?: string;
  readonly invitedParams?: InvitedParams;
  // readonly expiresAfter: Date;
  // readonly createdAt: Date;
  // readonly updatedAt: Date;
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
  readonly tenantIds: string[];
}

export interface ResListInvites {
  readonly type: "resListInvites";
  readonly tickets: {
    readonly tenantId: string;
    readonly invites: InviteTicket[];
  }[];
}

export interface ReqUpdateUserTenant {
  readonly type: "reqUpdateUserTenant";
  readonly auth: AuthType;
  readonly tenantId: string;
  readonly userId?: string;
  readonly role?: Role; // only if admin
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

export interface FPApiInterface {
  ensureUser(req: ReqEnsureUser): Promise<Result<ResEnsureUser>>;
  findUser(req: ReqFindUser): Promise<Result<ResFindUser>>;

  createTenant(req: ReqCreateTenant): Promise<Result<ResCreateTenant>>;
  updateTenant(req: ReqUpdateTenant): Promise<Result<ResUpdateTenant>>;
  deleteTenant(req: ReqDeleteTenant): Promise<Result<ResDeleteTenant>>;

  connectUserToTenant(req: ReqConnectUserToTenant): Promise<Result<ResConnectUserToTenant>>;
  listTenantsByUser(req: ReqListTenantsByUser): Promise<Result<ResListTenantsByUser>>;
  updateUserTenant(req: ReqUpdateUserTenant): Promise<Result<ResUpdateUserTenant>>;

  // creates / update invite
  inviteUser(req: ReqInviteUser): Promise<Result<ResInviteUser>>;
  listInvites(req: ReqListInvites): Promise<Result<ResListInvites>>;
  deleteInvite(req: ReqDeleteInvite): Promise<Result<ResDeleteInvite>>;

  // listLedgersByTenant(req: ReqListLedgerByTenant): Promise<ResListLedgerByTenant>

  // attachUserToLedger(req: ReqAttachUserToLedger): Promise<ResAttachUserToLedger>
}

interface FPApiMsgInterface {
  isDeleteTenant(jso: unknown): jso is ReqDeleteTenant;
  isUpdateTenant(jso: unknown): jso is ReqUpdateTenant;
  isCreateTenant(jso: unknown): jso is ReqCreateTenant;
  isDeleteInvite(jso: unknown): jso is ReqDeleteInvite;
  isListInvites(jso: unknown): jso is ReqListInvites;
  isInviteUser(jso: unknown): jso is ReqInviteUser;
  isFindUser(jso: unknown): jso is ReqFindUser;
  isConnectUserToTenant(jso: unknown): jso is ReqConnectUserToTenant;
  isEnsureUser(jso: unknown): jso is ReqEnsureUser;
  isListTenantsByUser(jso: unknown): jso is ReqListTenantsByUser;
  isUpdateUserTenant(jso: unknown): jso is ReqUpdateUserTenant;
}

class FAPIMsgImpl implements FPApiMsgInterface {
  isDeleteTenant(jso: unknown): jso is ReqDeleteTenant {
    return (jso as ReqDeleteTenant).type === "reqDeleteTenant";
  }
  isUpdateTenant(jso: unknown): jso is ReqUpdateTenant {
    return (jso as ReqUpdateTenant).type === "reqUpdateTenant";
  }
  isCreateTenant(jso: unknown): jso is ReqCreateTenant {
    return (jso as ReqCreateTenant).type === "reqCreateTenant";
  }
  isDeleteInvite(jso: unknown): jso is ReqDeleteInvite {
    return (jso as ReqDeleteInvite).type === "reqDeleteInvite";
  }
  isListInvites(jso: unknown): jso is ReqListInvites {
    return (jso as ReqListInvites).type === "reqListInvites";
  }
  isInviteUser(jso: unknown): jso is ReqInviteUser {
    return (jso as ReqInviteUser).type === "reqInviteUser";
  }
  isFindUser(jso: unknown): jso is ReqFindUser {
    return (jso as ReqFindUser).type === "reqFindUser";
  }
  isConnectUserToTenant(jso: unknown): jso is ReqConnectUserToTenant {
    return (jso as ReqConnectUserToTenant).type === "reqConnectUserToTenant";
  }

  isEnsureUser(jso: unknown): jso is ReqEnsureUser {
    return (jso as ReqEnsureUser).type === "reqEnsureUser";
  }

  isListTenantsByUser(jso: unknown): jso is ReqListTenantsByUser {
    return (jso as ReqListTenantsByUser).type === "reqListTenantsByUser";
  }
  isUpdateUserTenant(jso: unknown): jso is ReqUpdateUserTenant {
    return (jso as ReqUpdateUserTenant).type === "reqUpdateUserTenant";
  }
}

export const FPAPIMsg = new FAPIMsgImpl();

export interface FPApiToken {
  verify(token: string): Promise<Result<VerifiedAuth>>;
}

interface ReqInsertTenant {
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

// interface ResInsertTenant {
//     readonly tenantId: string;
//     readonly name?: string;
//     readonly ownerUserId: string;
//     readonly adminUserIds: string[];
//     readonly memberUserIds: string[];
//     readonly maxAdminUsers: number;
//     readonly maxMemberUsers: number;
//     readonly createdAt: Date;
//     readonly updatedAt: Date;
// }

// interface ReqInsertUser {
//   readonly userId: string;
//   readonly auth: ClerkVerifyAuth;
//   readonly maxTenants?: number;
//   readonly createdAt?: Date;
//   readonly updatedAt?: Date;
// }

type Role = "admin" | "member" | "owner";

interface ReqAddUserToTenant {
  readonly name?: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly default?: boolean;
  readonly role: Role;
}

interface ResAddUserToTenant {
  readonly name?: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly default: boolean;
  readonly role: Role;
}

type SQLTransaction = SQLiteTransaction<
  "async",
  ResultSet,
  Record<string, never>,
  ExtractTablesWithRelations<Record<string, never>>
>;

interface WithAuth {
  readonly auth: AuthType;
}

interface ActiveUser<T extends AuthType = ClerkVerifyAuth> {
  readonly verifiedAuth: T;
  readonly user?: User;
}

type ActiveUserWithUserId<T extends AuthType = ClerkVerifyAuth> = Omit<ActiveUser<ClerkVerifyAuth>, "user"> & {
  user: {
    userId: string;
    maxTenants: number;
  };
};

function nameFromAuth(name: string | undefined, auth: ActiveUserWithUserId): string {
  return (
    name ??
    `my-tenant[${auth.verifiedAuth.params.email ?? nickFromClarkClaim(auth.verifiedAuth.params) ?? auth.verifiedAuth.userId}]`
  );
}

function nickFromClarkClaim(auth: ClerkClaim): string | undefined {
  return auth.nick ?? auth.name;
}

export class FPApiSQL implements FPApiInterface {
  readonly db: LibSQLDatabase;
  readonly tokenApi: FPApiToken;
  readonly sthis: SuperThis;
  constructor(sthis: SuperThis, db: LibSQLDatabase, token: FPApiToken) {
    this.db = db;
    this.tokenApi = token;
    this.sthis = sthis;
  }

  private async _authToClerkVerifyAuth(req: { readonly auth: AuthType }): Promise<Result<ClerkVerifyAuth>> {
    const rAuth = await this.tokenApi.verify(req.auth.token);
    if (rAuth.isErr()) {
      return Result.Err(rAuth.Err());
    }
    if (rAuth.Ok().type !== "clerk") {
      return Result.Err("invalid auth type");
    }
    const auth = rAuth.Ok() as ClerkVerifyAuth;
    return Result.Ok(auth);
  }

  private async activeUser(req: WithAuth, status: UserStatus[] = ["active"]): Promise<Result<ActiveUser>> {
    const rAuth = await this._authToClerkVerifyAuth(req);
    if (rAuth.isErr()) {
      return Result.Err(rAuth.Err());
    }
    const auth = rAuth.Ok();
    const rExisting = await getUser(this.db, auth.userId);
    if (rExisting.isErr()) {
      if (isUserNotFound(rExisting)) {
        return Result.Ok({
          verifiedAuth: auth,
        });
      }
      return Result.Err(rExisting.Err());
    }
    return Result.Ok({
      verifiedAuth: auth,
      user: rExisting.Ok(),
    });
  }

  async ensureUser(req: ReqEnsureUser): Promise<Result<ResEnsureUser>> {
    const activeUser = await this.activeUser(req);
    if (activeUser.isErr()) {
      return Result.Err(activeUser.Err());
    }
    const user = activeUser.Ok().user;
    if (!user) {
      const auth = activeUser.Ok().verifiedAuth;
      const userId = this.sthis.nextId(12).str;
      const now = new Date();
      await upsetUserByProvider(
        this.db,
        {
          userId,
          maxTenants: 10,
          status: "active",
          statusReason: "just created",
          byProviders: [
            {
              providerUserId: auth.userId,
              queryProvider: nickFromClarkClaim(auth.params) ? "github" : "google",
              queryEmail: queryEmail(auth.params.email),
              cleanEmail: auth.params.email,
              queryNick: queryNick(nickFromClarkClaim(auth.params)),
              cleanNick: nickFromClarkClaim(auth.params),
              params: auth.params,
              used: now,
            },
          ],
        },
        now,
      );
      const authWithUserId = {
        ...activeUser.Ok(),
        user: {
          userId,
          maxTenants: 10,
        },
      };
      const rTenant = await this.insertTenant(authWithUserId, {
        ownerUserId: userId,
        maxAdminUsers: 5,
        maxMemberUsers: 5,
      });
      const res = await this.addUserToTenant(this.db, {
        name: nameFromAuth(undefined, authWithUserId),
        tenantId: rTenant.Ok().tenantId,
        userId: userId,
        role: "admin",
        default: true,
      });

      // });
      return this.ensureUser(req);
    }
    return Result.Ok({
      type: "resEnsureUser",
      user: user,
      tenants: await this.listTenantsByUser({
        type: "reqListTenantsByUser",
        auth: req.auth,
      }).then((r) => r.Ok().tenants),
    });
  }

  private async addUserToTenant(db: LibSQLDatabase, req: ReqAddUserToTenant): Promise<Result<ResAddUserToTenant>> {
    const tenant = await db.select().from(sqlTenants).where(eq(sqlTenants.tenantId, req.tenantId)).get();
    if (!tenant) {
      return Result.Err("tenant not found");
    }
    const role = await this.getRole(req.userId, tenant);
    if (role.foundRole) {
      const tenantUser = await db
        .select()
        .from(sqlTenantUsers)
        .where(and(eq(sqlTenantUsers.tenantId, req.tenantId), eq(sqlTenantUsers.userId, req.userId)))
        .get();
      if (!tenantUser) {
        return Result.Err("ref not found");
      }
      return Result.Ok({
        name: toUndef(tenantUser.name),
        tenantId: req.tenantId,
        userId: req.userId,
        default: !!tenantUser.default,
        role: role.role,
      });
    }
    switch (req.role) {
      case "admin":
        if (role.adminUserIds.length + 1 >= tenant.maxAdminUsers) {
          return Result.Err("max admins reached");
        }
        role.adminUserIds.push(req.userId);
        role.role = "admin";
        break;
      case "member":
      default:
        if (role.memberUserIds.length + 1 >= tenant.maxMemberUsers) {
          return Result.Err("max members reached");
        }
        role.memberUserIds.push(req.userId);
        role.role = "member";
        break;
    }
    const now = new Date().toISOString();
    await db
      .insert(sqlTenantUserRoles)
      .values({
        tenantId: req.tenantId,
        userId: req.userId,
        role: req.role,
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: [sqlTenantUserRoles.tenantId, sqlTenantUserRoles.userId],
        set: {
          role: role.role,
          createdAt: now,
        },
      });
    if (req.default) {
      await db
        .update(sqlTenantUsers)
        .set({
          default: 0,
          updatedAt: now,
        })
        .where(and(eq(sqlTenantUsers.tenantId, req.tenantId), eq(sqlTenantUsers.userId, req.userId), ne(sqlTenantUsers.default, 0)))
        .run();
    }
    await db.insert(sqlTenantUsers).values({
      tenantId: tenant.tenantId,
      userId: req.userId,
      name: req.name,
      default: req.default ? 1 : 0,
      createdAt: now,
      updatedAt: now,
    });
    return Result.Ok({
      name: req.name,
      tenantId: tenant.tenantId,
      userId: req.userId,
      default: req.default ?? false,
      active: true,
      role: role.role,
    });
  }

  async listTenantsByUser(req: ReqListTenantsByUser): Promise<Result<ResListTenantsByUser>> {
    const rAUR = await this.activeUser(req);
    if (rAUR.isErr()) {
      return Result.Err(rAUR.Err());
    }
    const aur = rAUR.Ok();
    if (!aur.user) {
      return Result.Err(new UserNotFoundError());
    }
    const tenantUsers = await this.db
      .select()
      .from(sqlTenantUsers)
      .innerJoin(sqlTenants, and(eq(sqlTenantUsers.tenantId, sqlTenants.tenantId)))
      .where(eq(sqlTenantUsers.userId, aur.user.userId))
      .all();
    // console.log(">>>>>", tenantUser);

    return Result.Ok({
      type: "resListTenantsByUser",
      userId: aur.user.userId,
      authUserId: aur.verifiedAuth.userId,
      tenants: await Promise.all(
        tenantUsers.map(async (t) => {
          const common = {
            user: {
              name: toUndef(t.TenantUsers.name),
              status: t.TenantUsers.status as UserStatus,
              statusReason: t.TenantUsers.statusReason,
              createdAt: new Date(t.TenantUsers.createdAt),
              updatedAt: new Date(t.TenantUsers.updatedAt),
            },
            tenant: {
              name: toUndef(t.Tenants.name),
              status: t.Tenants.status as UserStatus,
              statusReason: t.Tenants.statusReason,
              createdAt: new Date(t.Tenants.createdAt),
              updatedAt: new Date(t.Tenants.updatedAt),
            },
          };
          const role = await this.getRole(t.TenantUsers.userId, t.Tenants);
          switch (role.role) {
            case "member":
              return {
                ...common,
                tenantId: t.TenantUsers.tenantId,
                role: role.role,
                default: toBoolean(t.TenantUsers.default),
              };
            case "owner":
            case "admin":
              return {
                ...common,
                tenantId: t.TenantUsers.tenantId,
                role: role.role,
                default: toBoolean(t.TenantUsers.default),
                adminUserIds: role.adminUserIds,
                memberUserIds: role.memberUserIds,
                maxAdminUsers: t.Tenants.maxAdminUsers,
                maxMemberUsers: t.Tenants.maxMemberUsers,
              };
          }
        }),
      ),
    });
  }

  private async getRole(
    userId: string,
    tenant: typeof sqlTenants.$inferSelect,
  ): Promise<{
    role: Role;
    foundRole: boolean;
    adminUserIds: string[];
    memberUserIds: string[];
  }> {
    const rows = await this.db.select().from(sqlTenantUserRoles).where(eq(sqlTenantUserRoles.tenantId, tenant.tenantId)).all();
    const { adminUserIds, memberUserIds } = rows.reduce(
      (acc, row) => {
        switch (row.role) {
          case "admin":
            acc.adminUserIds.push(row.userId);
            break;
          case "member":
            acc.memberUserIds.push(row.userId);
            break;
        }
        return acc;
      },
      {
        adminUserIds: [] as string[],
        memberUserIds: [] as string[],
      },
    );
    const isAdmin = adminUserIds.includes(userId);
    const isMember = memberUserIds.includes(userId);
    return {
      adminUserIds: adminUserIds,
      memberUserIds: memberUserIds,
      foundRole: isAdmin || isMember,
      role: tenant.ownerUserId === userId ? "owner" : isAdmin ? "admin" : "member",
    };
  }

  async connectUserToTenant(req: ReqConnectUserToTenant): Promise<Result<ResConnectUserToTenant>> {
    const rAuth = await this.activeUser(req);
    if (rAuth.isErr()) {
      return Result.Err(rAuth.Err());
    }
    const auth = rAuth.Ok();
    if (!auth.user) {
      return Result.Err(new UserNotFoundError());
    }
    const res = await this.db
      .select()
      .from(sqlTenants)
      .innerJoin(
        sqlInviteTickets,
        and(eq(sqlTenants.tenantId, sqlInviteTickets.inviterTenantId), eq(sqlInviteTickets.invitedTenantId, req.tenantId)),
      )
      .where(eq(sqlTenants.tenantId, req.tenantId))
      .get();

    if (!res) {
      return Result.Err("tenant not found");
    }
    const invite = sqlToInvite(res.InviteTickets);
    const val = await this.addUserToTenant(this.db, {
      name: req.name,
      tenantId: res.Tenants.tenantId,
      userId: auth.user.userId,
      default: false,
      role: invite.invitedParams.tenant?.role ?? "member",
    });
    await this._deleteInvite(invite.inviteId);
    return Result.Ok({
      type: "resConnectUserToTenant",
      name: val.Ok().name ?? res.Tenants.name,
      tenant: sqlToOutTenantParams(res.Tenants),
      userId: auth.user.userId,
      role: invite.invitedParams.tenant?.role ?? "member",
    });
  }

  async findUser(req: ReqFindUser): Promise<Result<ResFindUser>> {
    const rAuth = await this.activeUser(req);
    if (rAuth.isErr()) {
      return Result.Err(rAuth.Err());
    }
    const auth = rAuth.Ok();
    if (!auth.user) {
      return Result.Err(new UserNotFoundError());
    }
    const rRows = await queryUser(this.db, req.query);
    return Result.Ok({
      type: "resFindUser",
      query: req.query,
      results: rRows.Ok(),
      // .map(
      //   (row) =>
      //     ({
      //       userId: row.userId,
      //       authProvider: row.queryProvider as AuthProvider,
      //       email: row.queryEmail as string,
      //       nick: row.queryNick as string,
      //       status: row.status as UserStatus,
      //       createdAt: new Date(row.createdAt),
      //       updatedAt: new Date(row.updatedAt),
      //     }) satisfies QueryResultUser,
      // ),
    });
  }

  async inviteUser(req: ReqInviteUser): Promise<Result<ResInviteUser>> {
    const rAuth = await this.activeUser(req);
    if (rAuth.isErr()) {
      return Result.Err(rAuth.Err());
    }
    const auth = rAuth.Ok();
    if (!auth.user) {
      return Result.Err(new UserNotFoundError());
    }
    const findUser = await queryUser(this.db, req.ticket.query);
    if (findUser.isErr()) {
      return Result.Err(findUser.Err());
    }
    if (req.ticket.query.existingUserId && findUser.Ok().length !== 1) {
      return Result.Err("existingUserId not found");
    }
    if (req.ticket.query.existingUserId === auth.user.userId) {
      return Result.Err("cannot invite self");
    }
    let sqlTicket: (typeof sqlInviteTickets.$inferSelect)[];
    if (!req.ticket.inviteId) {
      // check maxInvites
      const allowed = await this.db
        .select()
        .from(sqlTenants)
        .where(
          and(
            eq(sqlTenants.tenantId, req.ticket.inviterTenantId),
            gt(
              sqlTenants.maxInvites,
              this.db.$count(sqlInviteTickets, eq(sqlInviteTickets.inviterTenantId, req.ticket.inviterTenantId)),
            ),
          ),
        )
        .get();
      if (!allowed) {
        return Result.Err("max invites reached");
      }
      const is = await this.findInvite({
        query: req.ticket.query,
        tenantId: req.ticket.inviterTenantId,
      });
      if (is.length) {
        return Result.Err("invite already exists");
      }
      sqlTicket = await this.db
        .insert(sqlInviteTickets)
        .values(
          prepareInviteTicket({
            sthis: this.sthis,
            userId: auth.user.userId,
            tenantId: req.ticket.inviterTenantId,
            invitedTicketParams: {
              invitedParams: req.ticket.invitedParams ?? {},
              ...req.ticket,
            },
          }),
        )
        .returning();
    } else {
      // check if owner or admin of tenant
      if (!(await this.isOwnerOrAdminOfTenant(auth.user.userId, req.ticket.inviterTenantId))) {
        return Result.Err("not owner or admin of tenant");
      }
      const invitex = await this.findInvite({
        inviteId: req.ticket.inviteId,
        tenantId: req.ticket.inviterTenantId,
      });
      if (invitex.length !== 1) {
        return Result.Err("invite not found");
      }
      const invite = invitex[0];
      const toInsert = prepareInviteTicket({
        sthis: this.sthis,
        userId: auth.user.userId,
        tenantId: req.ticket.inviterTenantId,
        invitedTicketParams: {
          invitedParams: req.ticket.invitedParams ?? {},
          ...req.ticket,
        },
      });
      sqlTicket = await this.db
        .update(sqlInviteTickets)
        .set({
          sendEmailCount: req.ticket.incSendEmailCount ? invite.sendEmailCount + 1 : invite.sendEmailCount,
          invitedParams: toInsert.invitedParams,
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(eq(sqlInviteTickets.inviteId, req.ticket.inviteId), eq(sqlInviteTickets.inviterTenantId, req.ticket.inviterTenantId)),
        )
        .returning();
    }
    return Result.Ok({
      type: "resInviteUser",
      invite: sqlToInvite(sqlTicket[0]),
    });
  }

  private async findInvite(req: { query?: QueryUser; inviteId?: string; tenantId: string; now?: Date }): Promise<InviteTicket[]> {
    let condition = and(
      eq(sqlInviteTickets.inviterTenantId, req.tenantId),
      gt(sqlInviteTickets.expiresAfter, (req.now ?? new Date()).toISOString()),
    );
    if (!(req.inviteId || req.query)) {
      throw new Error("inviteId or query is required");
    }
    if (req.inviteId) {
      condition = and(eq(sqlInviteTickets.inviteId, req.inviteId), condition);
    }
    if (req.query) {
      condition = and(
        queryCondition(req.query, {
          ...sqlInviteTickets,
          userId: sqlInviteTickets.invitedUserId,
        }),
        condition,
      );
    }
    const rows = await this.db.select().from(sqlInviteTickets).where(condition).all();
    // housekeeping
    await this.db.delete(sqlInviteTickets).where(lt(sqlInviteTickets.expiresAfter, new Date().toISOString())).run();
    return rows.map((row) => sqlToInvite(row));
  }

  /**
   *
   * @description list invites for a user if user is owner of tenant or admin of tenant
   */
  async listInvites(req: ReqListInvites): Promise<Result<ResListInvites>> {
    const rAuth = await this.activeUser(req);
    if (rAuth.isErr()) {
      return Result.Err(rAuth.Err());
    }
    const auth = rAuth.Ok();
    if (!auth.user) {
      return Result.Err(new UserNotFoundError());
    }
    let rows: (typeof sqlInviteTickets.$inferSelect)[];
    const ownerTenants = await this.db
      .select()
      .from(sqlTenants)
      .where(eq(sqlTenants.ownerUserId, auth.user.userId))
      .all()
      .then((rows) => rows.map((row) => row.tenantId));
    // get admin in tenant for this user
    let condition = and(eq(sqlTenantUserRoles.userId, auth.user.userId), eq(sqlTenantUserRoles.role, "admin"));
    if (req.tenantIds.length) {
      // filter by tenantIds if set
      condition = and(inArray(sqlTenantUserRoles.tenantId, req.tenantIds), condition);
    }
    const adminTenants = await this.db
      .select()
      .from(sqlTenantUserRoles)
      .where(condition)
      .all()
      .then((rows) => rows.map((row) => row.tenantId));
    rows = await this.db
      .select()
      .from(sqlInviteTickets)
      .where(
        and(
          inArray(sqlInviteTickets.inviterTenantId, [...ownerTenants, ...adminTenants]),
          // inArray(inviteTickets.inv, req.tenantIds)
        ),
      )
      .all();
    // }
    return Result.Ok({
      type: "resListInvites",
      tickets: Array.from(
        rows
          .reduce((acc, row) => {
            if (!row.inviterTenantId) {
              throw new Error("inviterTenantId is required");
            }
            const invites = acc.get(row.inviterTenantId) ?? [];
            invites.push(sqlToInvite(row));
            acc.set(row.inviterTenantId, invites);
            return acc;
          }, new Map<string, InviteTicket[]>())
          .entries(),
      )
        .map(([tenantId, invites]) => ({
          tenantId,
          invites,
        }))
        .filter((x) => x.invites.length),
    });
  }

  async deleteInvite(req: ReqDeleteInvite): Promise<Result<ResDeleteInvite>> {
    const rAuth = await this.activeUser(req);
    if (rAuth.isErr()) {
      return Result.Err(rAuth.Err());
    }
    const auth = rAuth.Ok();
    if (!auth.user) {
      return Result.Err(new UserNotFoundError());
    }
    await this._deleteInvite(req.inviteId);
    return Result.Ok({
      type: "resDeleteInvite",
      inviteId: req.inviteId,
    });
  }

  private async _deleteInvite(inviteId: string): Promise<Result<void>> {
    await this.db.delete(sqlInviteTickets).where(eq(sqlInviteTickets.inviteId, inviteId)).run();
    return Result.Ok(undefined);
  }

  async updateUserTenant(req: ReqUpdateUserTenant): Promise<Result<ResUpdateUserTenant>> {
    const rAuth = await this.activeUser(req);
    if (rAuth.isErr()) {
      return Result.Err(rAuth.Err());
    }
    const auth = rAuth.Ok();
    if (!auth.user) {
      return Result.Err(new UserNotFoundError());
    }
    const userId = req.userId ?? auth.user.userId;
    if (req.role && (await this.isOwnerOrAdminOfTenant(userId, req.tenantId))) {
      await this.db
        .update(sqlTenantUserRoles)
        .set({
          role: req.role,
        })
        .where(and(eq(sqlTenantUserRoles.userId, userId), eq(sqlTenantUserRoles.tenantId, req.tenantId)))
        .run();
    }
    if (req.default) {
      await this.db
        .update(sqlTenantUsers)
        .set({
          default: 0,
        })
        .where(eq(sqlTenantUsers.userId, userId));
    }
    if (req.default || req.name) {
      const updateSet = {} as {
        default?: number;
        name?: string;
      };
      if (req.default) {
        updateSet.default = req.default ? 1 : 0;
      }
      if (req.name) {
        updateSet.name = req.name;
      }
      const ret = await this.db
        .update(sqlTenantUsers)
        .set(updateSet)
        .where(and(eq(sqlTenantUsers.userId, userId), eq(sqlTenantUsers.tenantId, req.tenantId)))
        .returning();
    }
    const ret = await this.db
      .select()
      .from(sqlTenantUsers)
      .innerJoin(
        sqlTenantUserRoles,
        and(eq(sqlTenantUsers.userId, sqlTenantUserRoles.userId), eq(sqlTenantUsers.tenantId, sqlTenantUserRoles.tenantId)),
      )
      .where(and(eq(sqlTenantUsers.userId, userId), eq(sqlTenantUsers.tenantId, req.tenantId)))
      .get();
    if (!ret) {
      return Result.Err("not found");
    }
    return Result.Ok({
      type: "resUpdateUserTenant",
      tenantId: ret.TenantUsers.tenantId,
      userId: ret.TenantUsers.userId,
      role: ret.TenantUserRoles.role as Role,
      default: !!ret.TenantUsers.default,
      name: toUndef(ret.TenantUsers.name),
    });
  }

  // async ensureTenant(req: ReqEnsureTenant): Promise<Result<ResEnsureTenant>> {
  //   const rAuth = await this.activeUser(req);
  //   if (rAuth.isErr()) {
  //     return Result.Err(rAuth.Err());
  //   }
  //   const auth = rAuth.Ok();
  //   if (!auth.user) {
  //     return Result.Err(new UserNotFoundError());
  //   }
  //   if (req.tenant.tenantId) {
  //     this.db.update(tenants).set({
  //     }).where(eq(tenants.tenantId, req.tenant.tenantId)).run();
  //   } else {
  //     const sqlTenant = this.insertTenantWithOwner({
  //       auth: auth as ActiveUserWithUserId<ClerkVerifyAuth>,
  //       name: req.tenant.name
  //     });
  //   }
  // }
  // private async insertTenantWithOwner(req: {
  //   auth: ActiveUserWithUserId<ClerkVerifyAuth>;
  //   param?: {
  //     name?: string;
  //     default?: boolean;
  //   }
  // }): Promise<Result<typeof tenants.$inferSelect>> {
  //   req.param = req.param ?? {};
  //   if (!req.auth.user) {
  //     return Result.Err(new UserNotFoundError());
  //   }
  //   function name(name: string | undefined, auth: Omit<ActiveUser<ClerkVerifyAuth>, "user">): string {
  //     return name ?? `my-tenant[${auth.verifiedAuth.params.email ?? auth.verifiedAuth.params.nick}]`
  //   }
  //   const tenantId = this.sthis.nextId(12).str;
  //   const tenant = await this.db
  //     .insert(tenants)
  //     .values(
  //       prepareInsertTenant({
  //         tenantId,
  //         name: name(req.param.name, req.auth),
  //         ownerUserId: req.auth.user.userId,
  //       }),
  //     )
  //     .returning();
  //   // await this.db.transaction(async (db) => {
  //   const res = await this.addUserToTenant(this.db, {
  //     name: name(req.param.name, req.auth),
  //     tenantId,
  //     userId: req.auth.user.userId,
  //     role: "admin",
  //     default: !!req.param.default
  //   });
  //   return Result.Ok(tenant[0])
  // }

  async createTenant(req: ReqCreateTenant): Promise<Result<ResCreateTenant>> {
    const rAuth = await this.activeUser(req);
    if (rAuth.isErr()) {
      return Result.Err(rAuth.Err());
    }
    const auth = rAuth.Ok();
    if (!auth.user) {
      return Result.Err(new UserNotFoundError());
    }
    const rTenant = await this.insertTenant(auth as ActiveUserWithUserId, {
      ...req.tenant,
      ownerUserId: auth.user.userId,
    });
    if (rTenant.isErr()) {
      return Result.Err(rTenant.Err());
    }
    const tenant = rTenant.Ok();
    await this.addUserToTenant(this.db, {
      name: nameFromAuth(req.tenant.name, auth as ActiveUserWithUserId),
      tenantId: tenant.tenantId,
      userId: auth.user.userId,
      role: "admin",
      default: false,
    });
    return Result.Ok({
      type: "resCreateTenant",
      tenant,
    });
  }

  private async insertTenant(auth: ActiveUserWithUserId, req: InCreateTenantParams): Promise<Result<OutTenantParams>> {
    const tenantId = this.sthis.nextId(12).str;
    const cnt = await this.db.$count(sqlTenants, eq(sqlTenants.ownerUserId, auth.user.userId));
    if (cnt + 1 >= auth.user.maxTenants) {
      return Result.Err("max tenants reached");
    }
    const nowStr = new Date().toISOString();
    const values = await this.db
      .insert(sqlTenants)
      .values({
        tenantId,
        name: req.name ?? `my-tenant[${tenantId}]`,
        ownerUserId: auth.user.userId,
        maxAdminUsers: req.maxAdminUsers ?? 5,
        maxMemberUsers: req.maxMemberUsers ?? 5,
        maxInvites: req.maxInvites ?? 10,
        createdAt: nowStr,
        updatedAt: nowStr,
      })
      .returning();
    return Result.Ok(sqlToOutTenantParams(values[0]));
  }

  async updateTenant(req: ReqUpdateTenant): Promise<Result<ResUpdateTenant>> {
    const rAuth = await this.activeUser(req);
    if (rAuth.isErr()) {
      return Result.Err(rAuth.Err());
    }
    const auth = rAuth.Ok();
    if (!auth.user) {
      return Result.Err(new UserNotFoundError());
    }
    const prev = await this.db.select().from(sqlTenants).where(eq(sqlTenants.tenantId, req.tenant.tenantId)).get();
    if (!prev) {
      return Result.Err("tenant not found");
    }
    if (!(await this.isOwnerOrAdminOfTenant(auth.user.userId, req.tenant.tenantId))) {
      return Result.Err("not owner of tenant");
    }
    const now = new Date().toISOString();
    const result = await this.db
      .update(sqlTenants)
      .set({
        name: req.tenant.name,
        maxAdminUsers: req.tenant.maxAdminUsers,
        maxMemberUsers: req.tenant.maxMemberUsers,
        maxInvites: req.tenant.maxInvites,
        updatedAt: now,
      })
      .where(eq(sqlTenants.tenantId, req.tenant.tenantId))
      .returning();
    return Result.Ok({
      type: "resUpdateTenant",
      tenant: sqlToOutTenantParams(result[0]),
    });
  }

  // private async attachUserToTenant(req: ReqAttachUserToTenant): Promise<Result<ResAttachUserToTenant>> {
  //   const rAuth = await this.activeUser(req);
  //   if (rAuth.isErr()) {
  //     return Result.Err(rAuth.Err());
  //   }
  //   const auth = rAuth.Ok();
  //   if (!auth.user) {
  //     return Result.Err(new UserNotFoundError());
  //   }
  // }

  async deleteTenant(req: ReqDeleteTenant): Promise<Result<ResDeleteTenant>> {
    const rAuth = await this.activeUser(req);
    if (rAuth.isErr()) {
      return Result.Err(rAuth.Err());
    }
    const auth = rAuth.Ok();
    if (!auth.user) {
      return Result.Err(new UserNotFoundError());
    }
    // check if owner or admin of tenant
    if (!(await this.isOwnerOrAdminOfTenant(auth.user.userId, req.tenantId))) {
      return Result.Err("not owner or admin of tenant");
    }
    // TODO remove ledgers
    await this.db.delete(sqlInviteTickets).where(eq(sqlInviteTickets.invitedTenantId, req.tenantId)).run();
    await this.db.delete(sqlTenantUserRoles).where(eq(sqlTenantUserRoles.tenantId, req.tenantId)).run();
    await this.db.delete(sqlTenantUsers).where(eq(sqlTenantUsers.tenantId, req.tenantId)).run();
    await this.db.delete(sqlTenants).where(eq(sqlTenants.tenantId, req.tenantId)).run();
    return Result.Ok({
      type: "resDeleteTenant",
      tenantId: req.tenantId,
    });
  }

  private async isOwnerOrAdminOfTenant(userId: string, tenantId: string): Promise<boolean> {
    const ownerRole = await this.db
      .select()
      .from(sqlTenants)
      .where(and(eq(sqlTenants.ownerUserId, userId), eq(sqlTenants.tenantId, tenantId)))
      .all();
    const adminRole = await this.db
      .select()
      .from(sqlTenantUserRoles)
      .where(
        and(eq(sqlTenantUserRoles.userId, userId), eq(sqlTenantUserRoles.tenantId, tenantId), eq(sqlTenantUserRoles.role, "admin")),
      )
      .all();
    return !!(ownerRole.length || adminRole.length);
  }
}

// // eslint-disable-next-line @typescript-eslint/no-unused-vars
// async attachUserToTenant(req: ReqAttachUserToTenant): Promise<Result<ResAttachUserToTenant>> {
//     const maxTenants = await this.db.select({
//         maxTenants: users.maxTenants
//     }).from(users).where(eq(users.userId, req.userId)).get() ?? { maxTenants: 5 }

//     const tendantCount = await this.db.$count(tenantUsers,
//         and(
//             eq(tenants.ownerUserId, req.userId),
//             ne(tenantUsers.active, 0)
//         ))

//     if (tendantCount >= maxTenants.maxTenants) {
//         return Result.Err(`max tenants reached:${maxTenants.maxTenants}`)
//     }

//     const now = new Date().toISOString();
//     const values = {
//         userId: req.userId,
//         tenantId: req.tenantId,
//         name: req.name,
//         active: 1,
//         createdAt: now,
//         updatedAt: now
//     }
//     const rRes = await this.db
//         .insert(tenantUsers)
//         .values(values)
//         .onConflictDoNothing()
//         .returning()
//         .run()
//     const res = rRes.toJSON()[0]
//     return Result.Ok({
//         type: 'resAttachUserToTenant',
//         name: req.name,
//         tenant: {
//             tenantId: res.
//                 name: req.name,
//             ownerUserId: req.userId,
//             adminUserIds: [],
//             memberUserIds: [],
//             maxAdminUsers: 5,
//             maxMemberUsers: 5,
//             createdAt: new Date(),
//             updatedAt: new Date()
//         },
//         userId: req.userId,
//         role: req.role
//     })

//     // throw new Error("Method not implemented.");
// }
// // eslint-disable-next-line @typescript-eslint/no-unused-vars
// async listLedgersByTenant(req: ReqListLedgerByTenant): Promise<ResListLedgerByTenant> {
//     throw new Error("Method not implemented.");
// }
// // eslint-disable-next-line @typescript-eslint/no-unused-vars
// async attachUserToLedger(req: ReqAttachUserToLedger): Promise<ResAttachUserToLedger> {
//     throw new Error("Method not implemented.");
// }

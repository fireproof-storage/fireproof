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
  VerifiedAuth,
  ClerkVerifyAuth,
  getUser,
  isUserNotFound,
  upsetUserByProvider,
  UserNotFoundError,
  queryUser,
} from "./users.ts";
import { Tenant, tenants, tenantUserRefs, tenantUserRefRoles } from "./tenants.ts";
import { InviteTicket, inviteTickets, sqlToInvite, prepareInviteTicket, InvitedParams } from "./invites.ts";
import { queryCondition, queryEmail, queryNick, QueryUser, toBoolean, toUndef } from "./sql-helper.ts";
import { au } from "vitest/dist/chunks/reporters.D7Jzd9GS.js";

export interface ReqEnsureUser {
  readonly type: "reqEnsureUser";
  readonly auth: AuthType;
}

// export interface TenantUserRef {
//     readonly userRefId: string;
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
//   readonly ownerUserRefId: string;
//   // null means don't change
//   readonly adminUserRefIds?: string[];
//   readonly memberUserRefIds?: string[];
//   readonly maxAdminUserRefs?: number;
//   readonly maxMemberUserRefs?: number;
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
  readonly ownerUserRefId: string;
  readonly maxAdminUserRefs: number;
  readonly maxMemberUserRefs: number;
  readonly maxInvites: number;
  readonly status: UserStatus;
  readonly statusReason: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

function sqlToOutTenantParams(sql: typeof tenants.$inferSelect): OutTenantParams {
  return {
    tenantId: sql.tenantId,
    name: sql.name,
    ownerUserRefId: sql.ownerUserRefId,
    maxAdminUserRefs: sql.maxAdminUserRefs,
    maxMemberUserRefs: sql.maxMemberUserRefs,
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
  readonly ownerUserRefId: string;
  readonly maxAdminUserRefs?: number;
  readonly maxMemberUserRefs?: number;
  readonly maxInvites?: number;
}

export interface ReqCreateTenant {
  readonly type: "reqCreateTenant";
  readonly auth: AuthType;
  readonly tenant: InCreateTenantParams;
}

export interface InUpdateTenantParams {
  readonly tenantId: string;
  readonly name?: string;
  readonly maxAdminUserRefs?: number;
  readonly maxMemberUserRefs?: number;
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
  readonly userRefId: string;
  readonly ledgers: Ledger[];
}

export interface ReqAttachUserToLedger {
  readonly type: "reqAttachUserToLedger";
  readonly auth: AuthType;
  readonly tenantId: string;
  readonly ledgerId: string;
  readonly userRefId: string;
  readonly role: "read" | "write";
}

export interface ResAttachUserToLedger {
  readonly type: "resAttachUserToLedger";
  readonly tenantId: string;
  readonly ledgerId: string;
  readonly userRefId: string;
  readonly role: "read" | "write";
}

export interface ReqListTenantsByUser {
  readonly type: "reqListTenantsByUser";
  readonly auth: AuthType;
}

export interface UserTenantCommon {
  readonly status: UserStatus;
  readonly statusReason: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface UserTenant {
  readonly tenantId: string;
  readonly tenantName?: string;
  readonly name?: string;
  readonly role: Role;
  readonly default: boolean;
  readonly ref: UserTenantCommon;
  readonly tenant: UserTenantCommon;
}

export interface OwnerTenant extends UserTenant {
  readonly role: "admin" | "owner";
  readonly adminUserRefIds: string[];
  readonly memberUserRefIds: string[];
  readonly maxAdminUserRefs: number;
  readonly maxMemberUserRefs: number;
}

export interface ResListTenantsByUser {
  readonly type: "resListTenantsByUser";
  readonly userRefId: string;
  readonly authUserId: string;
  readonly tenants: UserTenant[];
}

// export type AuthProvider = "github" | "google" | "fp";

export interface ReqFindUserRef {
  readonly type: "reqFindUserRef";
  readonly auth: AuthType;
  readonly query: QueryUser;
}

// export interface QueryResultUserRef {
//   readonly userRefId: string;
//   readonly authProvider: AuthProvider;
//   readonly email?: string;
//   readonly nick?: string;
//   readonly status: UserStatus;
//   readonly createdAt: Date;
//   readonly updatedAt: Date;
// }

export interface ResFindUserRef {
  readonly type: "resFindUserRef";
  // readonly userRefId: string;
  // readonly authUserId: string;
  readonly query: QueryUser;
  readonly results: User[];
}

export interface QueryInviteTicket {
  readonly incSendEmailCount?: boolean;

  // readonly inviterUserRefId: string;
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

export interface ReqRemoveInvite {
  readonly type: "reqRemoveInvite";
  readonly auth: AuthType;
  readonly inviteId: string;
}

export interface ResRemoveInvite {
  readonly type: "resRemoveInvite";
  readonly inviteId: string;
}

export interface ReqListInvites {
  readonly type: "reqListInvites";
  readonly auth: AuthType;
  // if set all invites for the given tenants are listed
  // if not set all invites for the userRef are listed
  readonly tenantIds: string[];
}

export interface ResListInvites {
  readonly type: "resListInvites";
  readonly tickets: {
    readonly tenantId: string;
    readonly invites: InviteTicket[];
  }[];
}

export interface FPApi {
  ensureUser(req: ReqEnsureUser): Promise<Result<ResEnsureUser>>;
  findUser(req: ReqFindUserRef): Promise<Result<ResFindUserRef>>;

  createTenant(req: ReqCreateTenant): Promise<Result<ResCreateTenant>>;
  updateTenant(req: ReqUpdateTenant): Promise<Result<ResUpdateTenant>>;
  deleteTenant(req: ReqDeleteTenant): Promise<Result<ResDeleteTenant>>;

  connectUserToTenant(req: ReqConnectUserToTenant): Promise<Result<ResConnectUserToTenant>>;
  listTenantsByUser(req: ReqListTenantsByUser): Promise<Result<ResListTenantsByUser>>;

  // creates / update invite
  inviteUser(req: ReqInviteUser): Promise<Result<ResInviteUser>>;
  listInvites(req: ReqListInvites): Promise<Result<ResListInvites>>;
  removeInvite(req: ReqRemoveInvite): Promise<Result<ResRemoveInvite>>;

  // listLedgersByTenant(req: ReqListLedgerByTenant): Promise<ResListLedgerByTenant>

  // attachUserToLedger(req: ReqAttachUserToLedger): Promise<ResAttachUserToLedger>
}

export interface FPApiToken {
  verify(token: string): Promise<Result<VerifiedAuth>>;
}

interface ReqInsertTenant {
  readonly tenantId: string;
  readonly name?: string;
  readonly ownerUserRefId: string;
  readonly adminUserRefIds?: string[];
  readonly memberUserRefIds?: string[];
  readonly maxAdminUserRefs?: number;
  readonly maxMemberUserRefs?: number;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}

// interface ResInsertTenant {
//     readonly tenantId: string;
//     readonly name?: string;
//     readonly ownerUserRefId: string;
//     readonly adminUserRefIds: string[];
//     readonly memberUserRefIds: string[];
//     readonly maxAdminUserRefs: number;
//     readonly maxMemberUserRefs: number;
//     readonly createdAt: Date;
//     readonly updatedAt: Date;
// }

interface ReqInsertUserRef {
  readonly userRefId: string;
  readonly auth: ClerkVerifyAuth;
  readonly maxTenants?: number;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}

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
  readonly userRefId: string;
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
  return name ?? `my-tenant[${auth.verifiedAuth.params.email ?? auth.verifiedAuth.params.nick ?? auth.verifiedAuth.userId}]`;
}

export class FPApiImpl implements FPApi {
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
    const activeUserRef = await this.activeUser(req);
    if (activeUserRef.isErr()) {
      return Result.Err(activeUserRef.Err());
    }
    const user = activeUserRef.Ok().user;
    if (!user) {
      const auth = activeUserRef.Ok().verifiedAuth;
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
              queryProvider: auth.params.nick ? "github" : "google",
              queryEmail: queryEmail(auth.params.email),
              cleanEmail: auth.params.email,
              queryNick: queryNick(auth.params.nick),
              cleanNick: auth.params.nick,
              params: auth.params,
              used: now,
            },
          ],
        },
        now,
      );
      const authWithUserId = {
        ...activeUserRef.Ok(),
        user: {
          userId,
          maxTenants: 10,
        },
      };
      const rTenant = await this.insertTenant(authWithUserId, {
        ownerUserRefId: userId,
        maxAdminUserRefs: 5,
        maxMemberUserRefs: 5,
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
    const tenant = await db.select().from(tenants).where(eq(tenants.tenantId, req.tenantId)).get();
    if (!tenant) {
      return Result.Err("tenant not found");
    }
    const role = await this.getRole(req.userId, tenant);
    if (role.foundRole) {
      const tenantUserRef = await db
        .select()
        .from(tenantUserRefs)
        .where(and(eq(tenantUserRefs.tenantId, req.tenantId), eq(tenantUserRefs.userRefId, req.userId)))
        .get();
      if (!tenantUserRef) {
        return Result.Err("ref not found");
      }
      return Result.Ok({
        name: toUndef(tenantUserRef.name),
        tenantId: req.tenantId,
        userRefId: req.userId,
        default: !!tenantUserRef.default,
        role: role.role,
      });
    }
    switch (req.role) {
      case "admin":
        if (role.adminUserRefIds.length + 1 >= tenant.maxAdminUserRefs) {
          return Result.Err("max admins reached");
        }
        role.adminUserRefIds.push(req.userId);
        role.role = "admin";
        break;
      case "member":
      default:
        if (role.memberUserRefIds.length + 1 >= tenant.maxMemberUserRefs) {
          return Result.Err("max members reached");
        }
        role.memberUserRefIds.push(req.userId);
        role.role = "member";
        break;
    }
    const now = new Date().toISOString();
    await db
      .insert(tenantUserRefRoles)
      .values({
        tenantId: req.tenantId,
        userRefId: req.userId,
        role: req.role,
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: [tenantUserRefRoles.tenantId, tenantUserRefRoles.userRefId],
        set: {
          role: role.role,
          createdAt: now,
        },
      });
    if (req.default) {
      await db
        .update(tenantUserRefs)
        .set({
          default: 0,
          updatedAt: now,
        })
        .where(
          and(eq(tenantUserRefs.tenantId, req.tenantId), eq(tenantUserRefs.userRefId, req.userId), ne(tenantUserRefs.default, 0)),
        )
        .run();
    }
    await db.insert(tenantUserRefs).values({
      tenantId: tenant.tenantId,
      userRefId: req.userId,
      name: req.name,
      default: req.default ? 1 : 0,
      createdAt: now,
      updatedAt: now,
    });
    return Result.Ok({
      name: req.name,
      tenantId: tenant.tenantId,
      userRefId: req.userId,
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
    const tenantUserRef = await this.db
      .select()
      .from(tenantUserRefs)
      .innerJoin(tenants, and(eq(tenantUserRefs.tenantId, tenants.tenantId), eq(tenantUserRefs.userRefId, tenants.ownerUserRefId)))
      .where(eq(tenantUserRefs.userRefId, aur.user.userId))
      .all();
    // console.log(">>>>>", tenantUserRef);

    return Result.Ok({
      type: "resListTenantsByUser",
      userRefId: aur.user.userId,
      authUserId: aur.verifiedAuth.userId,
      tenants: await Promise.all(
        tenantUserRef.map(async (t) => {
          const common = {
            ref: {
              status: t.TenantUserRefs.status as UserStatus,
              statusReason: t.TenantUserRefs.statusReason,
              createdAt: new Date(t.TenantUserRefs.createdAt),
              updatedAt: new Date(t.TenantUserRefs.updatedAt),
            },
            tenant: {
              status: t.Tenants.status as UserStatus,
              statusReason: t.Tenants.statusReason,
              createdAt: new Date(t.Tenants.createdAt),
              updatedAt: new Date(t.Tenants.updatedAt),
            },
          };
          const role = await this.getRole(t.TenantUserRefs.userRefId, t.Tenants);
          switch (role.role) {
            case "member":
              return {
                ...common,
                tenantId: t.TenantUserRefs.tenantId,
                tenantName: toUndef(t.Tenants.name),
                name: toUndef(t.TenantUserRefs.name),
                role: role.role,
                default: toBoolean(t.TenantUserRefs.default),
              };
            case "owner":
            case "admin":
              return {
                ...common,
                tenantId: t.TenantUserRefs.tenantId,
                tenantName: toUndef(t.Tenants.name),
                name: toUndef(t.TenantUserRefs.name),
                role: role.role,
                default: toBoolean(t.TenantUserRefs.default),
                adminUserRefIds: role.adminUserRefIds,
                memberUserRefIds: role.memberUserRefIds,
                maxAdminUserRefs: t.Tenants.maxAdminUserRefs,
                maxMemberUserRefs: t.Tenants.maxMemberUserRefs,
              };
          }
        }),
      ),
    });
  }

  private async getRole(
    userRefId: string,
    tenant: typeof tenants.$inferSelect,
  ): Promise<{
    role: Role;
    foundRole: boolean;
    adminUserRefIds: string[];
    memberUserRefIds: string[];
  }> {
    const rows = await this.db.select().from(tenantUserRefRoles).where(eq(tenantUserRefRoles.tenantId, tenant.tenantId)).all();
    const { adminUserRefIds, memberUserRefIds } = rows.reduce(
      (acc, row) => {
        switch (row.role) {
          case "admin":
            acc.adminUserRefIds.push(row.userRefId);
            break;
          case "member":
            acc.memberUserRefIds.push(row.userRefId);
            break;
        }
        return acc;
      },
      {
        adminUserRefIds: [] as string[],
        memberUserRefIds: [] as string[],
      },
    );
    const isAdmin = adminUserRefIds.includes(userRefId);
    const isMember = memberUserRefIds.includes(userRefId);
    return {
      adminUserRefIds,
      memberUserRefIds,
      foundRole: isAdmin || isMember,
      role: tenant.ownerUserRefId === userRefId ? "owner" : isAdmin ? "admin" : "member",
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
      .from(tenants)
      .innerJoin(
        inviteTickets,
        and(eq(tenants.tenantId, inviteTickets.inviterTenantId), eq(inviteTickets.invitedTenantId, req.tenantId)),
      )
      .where(eq(tenants.tenantId, req.tenantId))
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
    return Result.Ok({
      type: "resConnectUserToTenant",
      name: val.Ok().name ?? res.Tenants.name,
      tenant: sqlToOutTenantParams(res.Tenants),
      userId: auth.user.userId,
      role: invite.invitedParams.tenant?.role ?? "member",
    });
  }

  async findUser(req: ReqFindUserRef): Promise<Result<ResFindUserRef>> {
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
      type: "resFindUserRef",
      query: req.query,
      results: rRows.Ok(),
      // .map(
      //   (row) =>
      //     ({
      //       userRefId: row.userId,
      //       authProvider: row.queryProvider as AuthProvider,
      //       email: row.queryEmail as string,
      //       nick: row.queryNick as string,
      //       status: row.status as UserStatus,
      //       createdAt: new Date(row.createdAt),
      //       updatedAt: new Date(row.updatedAt),
      //     }) satisfies QueryResultUserRef,
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
    let sqlTicket: (typeof inviteTickets.$inferSelect)[];
    if (!req.ticket.inviteId) {
      // check maxInvites
      const allowed = await this.db
        .select()
        .from(tenants)
        .where(
          and(
            eq(tenants.tenantId, req.ticket.inviterTenantId),
            gt(tenants.maxInvites, this.db.$count(inviteTickets, eq(inviteTickets.inviterTenantId, req.ticket.inviterTenantId))),
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
        .insert(inviteTickets)
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
        .update(inviteTickets)
        .set({
          sendEmailCount: req.ticket.incSendEmailCount ? invite.sendEmailCount + 1 : invite.sendEmailCount,
          invitedParams: toInsert.invitedParams,
          updatedAt: new Date().toISOString(),
        })
        .where(and(eq(inviteTickets.inviteId, req.ticket.inviteId), eq(inviteTickets.inviterTenantId, req.ticket.inviterTenantId)))
        .returning();
    }
    return Result.Ok({
      type: "resInviteUser",
      invite: sqlToInvite(sqlTicket[0]),
    });
  }

  private async findInvite(req: { query?: QueryUser; inviteId?: string; tenantId: string; now?: Date }): Promise<InviteTicket[]> {
    let condition = and(
      eq(inviteTickets.inviterTenantId, req.tenantId),
      gt(inviteTickets.expiresAfter, (req.now ?? new Date()).toISOString()),
    );
    if (!(req.inviteId || req.query)) {
      throw new Error("inviteId or query is required");
    }
    if (req.inviteId) {
      condition = and(eq(inviteTickets.inviteId, req.inviteId), condition);
    }
    if (req.query) {
      condition = and(
        queryCondition(req.query, {
          ...inviteTickets,
          userId: inviteTickets.invitedUserId,
        }),
        condition,
      );
    }
    const rows = await this.db.select().from(inviteTickets).where(condition).all();
    // housekeeping
    await this.db.delete(inviteTickets).where(lt(inviteTickets.expiresAfter, new Date().toISOString())).run();
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
    let rows: (typeof inviteTickets.$inferSelect)[];
    const ownerTenants = await this.db
      .select()
      .from(tenants)
      .where(eq(tenants.ownerUserRefId, auth.user.userId))
      .all()
      .then((rows) => rows.map((row) => row.tenantId));
    // get admin in tenant for this user
    let condition = and(eq(tenantUserRefRoles.userRefId, auth.user.userId), eq(tenantUserRefRoles.role, "admin"));
    if (req.tenantIds.length) {
      // filter by tenantIds if set
      condition = and(inArray(tenantUserRefRoles.tenantId, req.tenantIds), condition);
    }
    const adminTenants = await this.db
      .select()
      .from(tenantUserRefRoles)
      .where(condition)
      .all()
      .then((rows) => rows.map((row) => row.tenantId));
    rows = await this.db
      .select()
      .from(inviteTickets)
      .where(
        and(
          inArray(inviteTickets.inviterTenantId, [...ownerTenants, ...adminTenants]),
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

  async removeInvite(req: ReqRemoveInvite): Promise<Result<ResRemoveInvite>> {
    const rAuth = await this.activeUser(req);
    if (rAuth.isErr()) {
      return Result.Err(rAuth.Err());
    }
    const auth = rAuth.Ok();
    if (!auth.user) {
      return Result.Err(new UserNotFoundError());
    }
    await this.db.delete(inviteTickets).where(eq(inviteTickets.inviteId, req.inviteId)).run();
    return Result.Ok({
      type: "resRemoveInvite",
      inviteId: req.inviteId,
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
  //         ownerUserRefId: req.auth.user.userId,
  //       }),
  //     )
  //     .returning();
  //   // await this.db.transaction(async (db) => {
  //   const res = await this.addUserToTenant(this.db, {
  //     name: name(req.param.name, req.auth),
  //     tenantId,
  //     userRefId: req.auth.user.userId,
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
    return Result.Ok({
      type: "resCreateTenant",
      tenant: await this.insertTenant(auth as ActiveUserWithUserId, req.tenant).then((r) => r.Ok()),
    });
  }

  private async insertTenant(auth: ActiveUserWithUserId, req: InCreateTenantParams): Promise<Result<OutTenantParams>> {
    const tenantId = this.sthis.nextId(12).str;
    const cnt = await this.db.$count(tenants, eq(tenants.ownerUserRefId, auth.user.userId));
    if (cnt + 1 >= auth.user.maxTenants) {
      return Result.Err("max tenants reached");
    }
    const nowStr = new Date().toISOString();
    const values = await this.db
      .insert(tenants)
      .values({
        tenantId,
        name: req.name ?? `my-tenant[${tenantId}]`,
        ownerUserRefId: auth.user.userId,
        maxAdminUserRefs: req.maxAdminUserRefs ?? 5,
        maxMemberUserRefs: req.maxMemberUserRefs ?? 5,
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
    const prev = await this.db.select().from(tenants).where(eq(tenants.tenantId, req.tenant.tenantId)).get();
    if (!prev) {
      return Result.Err("tenant not found");
    }
    if (await this.isOwnerOrAdminOfTenant(auth.user.userId, req.tenant.tenantId)) {
      return Result.Err("not owner of tenant");
    }
    const now = new Date().toISOString();
    const result = await this.db
      .update(tenants)
      .set({
        name: req.tenant.name,
        maxAdminUserRefs: req.tenant.maxAdminUserRefs,
        maxMemberUserRefs: req.tenant.maxMemberUserRefs,
        maxInvites: req.tenant.maxInvites,
        updatedAt: now,
      })
      .where(eq(tenants.tenantId, req.tenant.tenantId))
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
    await this.db.delete(inviteTickets).where(eq(inviteTickets.invitedTenantId, req.tenantId)).run();
    await this.db.delete(tenantUserRefRoles).where(eq(tenantUserRefRoles.tenantId, req.tenantId)).run();
    await this.db.delete(tenantUserRefs).where(eq(tenantUserRefs.tenantId, req.tenantId)).run();
    await this.db.delete(tenants).where(eq(tenants.tenantId, req.tenantId)).run();
    return Result.Ok({
      type: "resDeleteTenant",
      tenantId: req.tenantId,
    });
  }

  private async isOwnerOrAdminOfTenant(userId: string, tenantId: string): Promise<boolean> {
    const ownerRole = await this.db
      .select()
      .from(tenants)
      .where(and(eq(tenants.ownerUserRefId, userId), eq(tenants.tenantId, tenantId)))
      .all();
    const adminRole = await this.db
      .select()
      .from(tenantUserRefRoles)
      .where(
        and(
          eq(tenantUserRefRoles.userRefId, userId),
          eq(tenantUserRefRoles.tenantId, tenantId),
          eq(tenantUserRefRoles.role, "admin"),
        ),
      )
      .all();
    return !!(ownerRole.length || adminRole.length);
  }
}

// // eslint-disable-next-line @typescript-eslint/no-unused-vars
// async attachUserToTenant(req: ReqAttachUserToTenant): Promise<Result<ResAttachUserToTenant>> {
//     const maxTenants = await this.db.select({
//         maxTenants: userRefs.maxTenants
//     }).from(userRefs).where(eq(userRefs.userRefId, req.userRefId)).get() ?? { maxTenants: 5 }

//     const tendantCount = await this.db.$count(tenantUserRefs,
//         and(
//             eq(tenants.ownerUserRefId, req.userRefId),
//             ne(tenantUserRefs.active, 0)
//         ))

//     if (tendantCount >= maxTenants.maxTenants) {
//         return Result.Err(`max tenants reached:${maxTenants.maxTenants}`)
//     }

//     const now = new Date().toISOString();
//     const values = {
//         userRefId: req.userRefId,
//         tenantId: req.tenantId,
//         name: req.name,
//         active: 1,
//         createdAt: now,
//         updatedAt: now
//     }
//     const rRes = await this.db
//         .insert(tenantUserRefs)
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
//             ownerUserRefId: req.userRefId,
//             adminUserRefIds: [],
//             memberUserRefIds: [],
//             maxAdminUserRefs: 5,
//             maxMemberUserRefs: 5,
//             createdAt: new Date(),
//             updatedAt: new Date()
//         },
//         userRefId: req.userRefId,
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

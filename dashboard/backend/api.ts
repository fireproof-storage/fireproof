import { Result } from "@adviser/cement";
import { SuperThis } from "@fireproof/core";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import type { SQLiteTransaction } from "drizzle-orm/sqlite-core";
import type { ResultSet } from "@libsql/client";
import { type ExtractTablesWithRelations } from "drizzle-orm";
import { eq, and, inArray, gt, lt } from "drizzle-orm/expressions";
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
import { Tenant, tenants, prepareInsertTenant, tenantUserRefs, tenantUserRefRoles } from "./tenants.ts";
import { InviteTicket, inviteTickets, sqlToInvite, prepareInviteTicket, InvitedParams } from "./invites.ts";
import { queryCondition, queryEmail, queryNick, QueryUser, toBoolean, toUndef } from "./sql-helper.ts";

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

export interface ReqEnsureTenant {
  readonly type: "reqEnsureTenant";
  readonly auth: AuthType;
  readonly tenantId: string;
  readonly name: string;
  readonly ownerUserRefId: string;
  // null means don't change
  readonly adminUserRefIds?: string[];
  readonly memberUserRefIds?: string[];
  readonly maxAdminUserRefs?: number;
  readonly maxMemberUserRefs?: number;
}

export interface ResEnsureTenant {
  readonly type: "resEnsureTenant";
  readonly tenant: Tenant;
}

export interface ReqAttachUserToTenant {
  readonly type: "reqAttachUserToTenant";
  readonly auth: AuthType;
  // name can be updated
  readonly name: string;
  readonly tenantId: string;
  readonly userRefId: string;
  readonly role: "admin" | "member";
}

export interface ResAttachUserToTenant {
  readonly type: "resAttachUserToTenant";
  readonly name: string;
  readonly tenant: Tenant;
  readonly userRefId: string;
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
  ensureUserRef(req: ReqEnsureUser): Promise<Result<ResEnsureUser>>;

  listTenantsByUser(req: ReqListTenantsByUser): Promise<Result<ResListTenantsByUser>>;

  findUserRef(req: ReqFindUserRef): Promise<Result<ResFindUserRef>>;

  // creates / update invite
  inviteUser(req: ReqInviteUser): Promise<Result<ResInviteUser>>;
  listInvites(req: ReqListInvites): Promise<Result<ResListInvites>>;
  removeInvite(req: ReqRemoveInvite): Promise<Result<ResRemoveInvite>>;

  // attachUserToTenant(req: ReqAttachUserToTenant): Promise<ResAttachUserToTenant>

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
  readonly userRefId: string;
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

interface ActiveUserRef<T extends AuthType = ClerkVerifyAuth> {
  readonly verifiedAuth: T;
  readonly user?: User;
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

  private async activeUser(req: WithAuth, status: UserStatus[] = ["active"]): Promise<Result<ActiveUserRef>> {
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

  async ensureUserRef(req: ReqEnsureUser): Promise<Result<ResEnsureUser>> {
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

      // await this.db
      //   .insert(users)
      //   .values(
      //     prepareInsertUserRef({
      //       userRefId: userId,
      //       auth,
      //     }),
      //   )
      //   .run();
      const tenantId = this.sthis.nextId(12).str;
      await this.db
        .insert(tenants)
        .values(
          prepareInsertTenant({
            tenantId,
            name: `my-tenant[${auth.params.email ?? auth.params.nick}]`,
            ownerUserRefId: userId,
          }),
        )
        .run();
      // await this.db.transaction(async (db) => {
      await this.addUserToTenant(this.db, {
        name: `my-tenant[${auth.params.email ?? auth.params.nick}]`,
        tenantId,
        userRefId: userId,
        role: "admin",
        default: true,
      });
      // });
      return this.ensureUserRef(req);
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
    const role = await this.getRole(req.userRefId, tenant);
    if (role.foundRole) {
      const tenantUserRef = await db
        .select()
        .from(tenantUserRefs)
        .where(and(eq(tenantUserRefs.tenantId, req.tenantId), eq(tenantUserRefs.userRefId, req.userRefId)))
        .get();
      if (!tenantUserRef) {
        return Result.Err("ref not found");
      }
      return Result.Ok({
        name: toUndef(tenantUserRef.name),
        tenantId: req.tenantId,
        userRefId: req.userRefId,
        default: !!tenantUserRef.default,
        role: role.role,
      });
    }
    switch (req.role) {
      case "admin":
        if (role.adminUserRefIds.length + 1 >= tenant.maxAdminUserRefs) {
          return Result.Err("max admins reached");
        }
        role.adminUserRefIds.push(req.userRefId);
        role.role = "admin";
        break;
      case "member":
      default:
        if (role.memberUserRefIds.length + 1 >= tenant.maxMemberUserRefs) {
          return Result.Err("max members reached");
        }
        role.memberUserRefIds.push(req.userRefId);
        role.role = "member";
        break;
    }
    const now = new Date().toISOString();
    await db
      .insert(tenantUserRefRoles)
      .values({
        tenantId: req.tenantId,
        userRefId: req.userRefId,
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
    await db.insert(tenantUserRefs).values({
      tenantId: tenant.tenantId,
      userRefId: req.userRefId,
      name: req.name,
      default: req.default ? 1 : 0,
      createdAt: now,
      updatedAt: now,
    });
    return Result.Ok({
      name: req.name,
      tenantId: tenant.tenantId,
      userRefId: req.userRefId,
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

  async findUserRef(req: ReqFindUserRef): Promise<Result<ResFindUserRef>> {
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
    // check if owner or admin of tenant
    const ownerRole = await this.db
      .select()
      .from(tenants)
      .where(and(eq(tenants.ownerUserRefId, auth.user.userId), eq(tenants.tenantId, req.ticket.inviterTenantId)))
      .all();
    const adminRole = await this.db
      .select()
      .from(tenantUserRefRoles)
      .where(
        and(
          eq(tenantUserRefRoles.userRefId, auth.user.userId),
          eq(tenantUserRefRoles.tenantId, req.ticket.inviterTenantId),
          eq(tenantUserRefRoles.role, "admin"),
        ),
      )
      .all();
    if (!(ownerRole.length || adminRole.length)) {
      return Result.Err("not owner or admin of tenant");
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

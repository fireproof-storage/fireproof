import { Logger, Result } from "@adviser/cement";
import { SuperThis } from "@fireproof/core";
import { gte, and, eq, gt, inArray, lt, ne, or } from "drizzle-orm/sql/expressions";
// import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { jwtVerify } from "jose";
import {
  AuthType,
  ClerkClaim,
  ClerkVerifyAuth,
  InviteTicket,
  InvitedParams,
  QueryUser,
  ReqCloudSessionToken,
  ReqCreateLedger,
  ReqCreateTenant,
  ReqDeleteInvite,
  ReqDeleteLedger,
  ReqDeleteTenant,
  ReqEnsureUser,
  ReqExtendToken,
  ReqFindUser,
  ReqInviteUser,
  ReqListInvites,
  ReqListLedgersByUser,
  ReqListTenantsByUser,
  ReqRedeemInvite,
  ReqTokenByResultId,
  ReqUpdateLedger,
  ReqUpdateTenant,
  ReqUpdateUserTenant,
  ResCloudSessionToken,
  ResCreateLedger,
  ResCreateTenant,
  ResDeleteInvite,
  ResDeleteLedger,
  ResDeleteTenant,
  ResEnsureUser,
  ResExtendToken,
  ResFindUser,
  ResInviteUser,
  ResListInvites,
  ResListLedgersByUser,
  ResListTenantsByUser,
  ResRedeemInvite,
  ResTokenByResultId,
  ResUpdateLedger,
  ResUpdateTenant,
  ResUpdateUserTenant,
  UserStatus,
  VerifiedAuth,
  FAPIMsgImpl,
  ActiveUserWithUserId,
  ActiveUser,
  WithAuth,
  isActiveUserWithUserId,
  User,
} from "@fireproof/core-protocols-dashboard";
import { prepareInviteTicket, sqlInviteTickets, sqlToInviteTickets } from "./invites.js";
import { sqlLedgerUsers, sqlLedgers, sqlToLedgers } from "./ledgers.js";
import { queryCondition, queryEmail, queryNick, toBoolean, toUndef } from "./sql-helper.js";
import { sqlTenantUsers, sqlTenants } from "./tenants.js";
import { sqlTokenByResultId } from "./token-by-result-id.js";
import { UserNotFoundError, getUser, isUserNotFound, queryUser, upsetUserByProvider } from "./users.js";
import { createFPToken, FPTokenContext, getFPTokenContext } from "./create-fp-token.js";
import { Role, ReadWrite, toRole, toReadWrite, FPUserToken } from "@fireproof/core-types-protocols-cloud";
import { ensureLogger, sts } from "@fireproof/core-runtime";
import { DashSqlite } from "./create-handler.js";
import { dbGetRoles } from "./db/get-roles.js";
import { dbListLedgersByUser } from "./db/list-ledger-by-user.js";
import { dbGetCloudSessionToken } from "./db/get-cloud-session-token.js";
import { dbInsertTenant, sqlToOutTenantParams } from "./db/insert-tenant.js";
import { dbUpdateLedger } from "./db/update-ledger.js";
import { isAdminOfTenant } from "./db/is-admin-of-tenant.js";
import { isAdminOfLedger } from "./db/is-admin-of-ledger.js";

export interface TokenByResultIdParam {
  readonly status: "found" | "not-found";
  readonly resultId: string;
  readonly token?: string; // JWT
  readonly now: Date;
}

export interface FPApiInterface {
  ensureUser(req: ReqEnsureUser): Promise<Result<ResEnsureUser>>;
  findUser(req: ReqFindUser): Promise<Result<ResFindUser>>;

  createTenant(req: ReqCreateTenant): Promise<Result<ResCreateTenant>>;
  updateTenant(req: ReqUpdateTenant): Promise<Result<ResUpdateTenant>>;
  deleteTenant(req: ReqDeleteTenant): Promise<Result<ResDeleteTenant>>;

  redeemInvite(req: ReqRedeemInvite): Promise<Result<ResRedeemInvite>>;

  listTenantsByUser(req: ReqListTenantsByUser): Promise<Result<ResListTenantsByUser>>;
  updateUserTenant(req: ReqUpdateUserTenant): Promise<Result<ResUpdateUserTenant>>;

  // creates / update invite
  inviteUser(req: ReqInviteUser): Promise<Result<ResInviteUser>>;
  listInvites(req: ReqListInvites): Promise<Result<ResListInvites>>;
  deleteInvite(req: ReqDeleteInvite): Promise<Result<ResDeleteInvite>>;

  createLedger(req: ReqCreateLedger): Promise<Result<ResCreateLedger>>;
  listLedgersByUser(req: ReqListLedgersByUser): Promise<Result<ResListLedgersByUser>>;
  updateLedger(req: ReqUpdateLedger): Promise<Result<ResUpdateLedger>>;
  deleteLedger(req: ReqDeleteLedger): Promise<Result<ResDeleteLedger>>;

  // listLedgersByTenant(req: ReqListLedgerByTenant): Promise<ResListLedgerByTenant>

  // attachUserToLedger(req: ReqAttachUserToLedger): Promise<ResAttachUserToLedger>
  getCloudSessionToken(req: ReqCloudSessionToken): Promise<Result<ResCloudSessionToken>>;
  getTokenByResultId(req: ReqTokenByResultId): Promise<Result<ResTokenByResultId>>;
  extendToken(req: ReqExtendToken): Promise<Result<ResExtendToken>>;
}

export const FPAPIMsg = new FAPIMsgImpl();

export interface FPApiToken {
  verify(token: string): Promise<Result<VerifiedAuth>>;
}

// interface ReqInsertTenant {
//   readonly tenantId: string;
//   readonly name?: string;
//   readonly ownerUserId: string;
//   readonly adminUserIds?: string[];
//   readonly memberUserIds?: string[];
//   readonly maxAdminUsers?: number;
//   readonly maxMemberUsers?: number;
//   readonly createdAt?: Date;
//   readonly updatedAt?: Date;
// }

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

interface AddUserToTenant {
  readonly userName?: string;
  readonly tenantName?: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly default?: boolean;
  readonly role: Role;
  readonly status?: UserStatus;
  readonly statusReason?: string;
}

interface AddUserToLedger {
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

// interface ResAddUserToTenant {
//   readonly name?: string;
//   readonly tenantId: string;
//   readonly userId: string;
//   readonly default: boolean;
//   readonly role: Role;
// }

// type SQLTransaction = SQLiteTransaction<
//   "async",
//   ResultSet,
//   Record<string, never>,
//   ExtractTablesWithRelations<Record<string, never>>
// >;

function nameFromAuth(name: string | undefined, auth: ActiveUserWithUserId): string {
  return name ?? `${auth.verifiedAuth.params.email ?? nickFromClarkClaim(auth.verifiedAuth.params) ?? auth.verifiedAuth.userId}`;
}

function nickFromClarkClaim(auth: ClerkClaim): string | undefined {
  return auth.nick ?? auth.name;
}

export class FPApiSQL implements FPApiInterface {
  readonly db: DashSqlite;
  readonly tokenApi: Record<string, FPApiToken>;
  readonly sthis: SuperThis;
  readonly logger: Logger;
  constructor(sthis: SuperThis, db: DashSqlite, tokenApi: Record<string, FPApiToken>) {
    this.db = db;
    this.tokenApi = tokenApi;
    this.sthis = sthis;
    this.logger = ensureLogger(sthis, "FPApiSQL");
  }

  private async _authVerifyAuth(req: { readonly auth: AuthType }): Promise<Result<ClerkVerifyAuth>> {
    // console.log("_authVerify-1", req);
    const tokenApi = this.tokenApi[req.auth.type];
    // console.log("_authVerify-2", req);
    if (!tokenApi) {
      return Result.Err(`invalid auth type:[${req.auth.type}]`);
    }
    const rAuth = await tokenApi.verify(req.auth.token);
    if (rAuth.isErr()) {
      return Result.Err(rAuth.Err());
    }
    // if (rAuth.Ok().type !== "clerk") {
    //   return Result.Err("invalid auth type");
    // }
    const auth = rAuth.Ok() as ClerkVerifyAuth;
    return Result.Ok(auth);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private async activeUser(req: WithAuth, status: UserStatus[] = ["active"]): Promise<Result<ActiveUser>> {
    // console.log("activeUser-1", req);
    const rAuth = await this._authVerifyAuth(req);
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
    // console.log("ensureUser-1", req);
    const activeUser = await this.activeUser(req);
    // console.log("ensureUser-2", req);
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
          createdAt: now,
          userId,
          maxTenants: 10,
        } as User,
      };
      const rTenant = await dbInsertTenant(this, authWithUserId, {
        ownerUserId: userId,
        maxAdminUsers: 5,
        maxMemberUsers: 5,
      });
      await this.addUserToTenant(this.db, {
        userName: nameFromAuth(undefined, authWithUserId),
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

  private async addUserToTenant(db: DashSqlite, req: Omit<AddUserToTenant, "tenantName">): Promise<Result<AddUserToTenant>> {
    const tenant = await db
      .select()
      .from(sqlTenants)
      .where(and(eq(sqlTenants.tenantId, req.tenantId), eq(sqlTenants.status, "active")))
      .get();
    if (!tenant) {
      return Result.Err("tenant not found");
    }
    const roles = await dbGetRoles(this, req.userId, [tenant], []);
    if (roles.length > 1) {
      return Result.Err("multiple roles found");
    }
    if (roles.length && roles[0].role) {
      const tenantUser = await db
        .select()
        .from(sqlTenantUsers)
        .where(
          and(
            eq(sqlTenantUsers.tenantId, req.tenantId),
            eq(sqlTenantUsers.userId, req.userId),
            eq(sqlTenantUsers.status, "active"),
          ),
        )
        .get();
      if (!tenantUser) {
        return Result.Err("ref not found");
      }
      return Result.Ok({
        userName: toUndef(tenantUser.name),
        tenantName: toUndef(tenant.name),
        tenantId: req.tenantId,
        userId: req.userId,
        default: !!tenantUser.default,
        role: toRole(tenantUser.role),
        status: tenantUser.status as UserStatus,
        statusReason: tenantUser.statusReason,
      });
    }
    const rCheck = await this.checkMaxRoles(tenant, req.role);
    if (rCheck.isErr()) {
      return Result.Err(rCheck.Err());
    }
    const now = new Date().toISOString();
    if (req.default) {
      await db
        .update(sqlTenantUsers)
        .set({
          default: 0,
          updatedAt: now,
        })
        .where(and(eq(sqlTenantUsers.userId, req.userId), ne(sqlTenantUsers.default, 0)))
        .run();
    }
    const ret = (
      await db
        .insert(sqlTenantUsers)
        .values({
          tenantId: tenant.tenantId,
          userId: req.userId,
          name: req.userName,
          role: req.role,
          default: req.default ? 1 : 0,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
    )[0];
    return Result.Ok({
      userName: toUndef(ret.name),
      tenantName: tenant.name,
      tenantId: tenant.tenantId,
      userId: ret.userId,
      default: ret.default ? true : false,
      status: ret.status as UserStatus,
      statusReason: ret.statusReason,
      role: toRole(ret.role),
    });
  }

  private async checkMaxRoles(sqlTenant: typeof sqlTenants.$inferSelect, reqRole: string): Promise<Result<void>> {
    const tenantUsers = await this.db
      .select()
      .from(sqlTenantUsers)
      .where(and(eq(sqlTenantUsers.tenantId, sqlTenant.tenantId), eq(sqlTenantUsers.status, "active")))
      .all();
    const ledgerUsers = await this.db
      .select()
      .from(sqlLedgers)
      .innerJoin(sqlLedgerUsers, and(eq(sqlLedgerUsers.ledgerId, sqlLedgers.ledgerId), eq(sqlLedgerUsers.status, "active")))
      .where(eq(sqlLedgers.tenantId, sqlTenant.tenantId))
      .all();
    const adminUsers = new Set([
      ...tenantUsers.filter((tu) => tu.role === "admin"),
      ...ledgerUsers.filter((lu) => lu.LedgerUsers.role === "admin"),
    ]);
    const memberUsers = Array.from(
      new Set([...tenantUsers.filter((tu) => tu.role !== "admin"), ...ledgerUsers.filter((lu) => lu.LedgerUsers.role !== "admin")]),
    ).filter((u) => !adminUsers.has(u));
    if (reqRole === "admin") {
      if (adminUsers.size + 1 >= sqlTenant.maxAdminUsers) {
        return Result.Err("max admins reached");
      }
    }
    if (reqRole !== "admin") {
      if (memberUsers.length + 1 >= sqlTenant.maxMemberUsers) {
        return Result.Err("max members reached");
      }
    }
    return Result.Ok(undefined);
  }

  private async addUserToLedger(db: DashSqlite, req: AddUserToLedger): Promise<Result<AddUserToLedger>> {
    const ledger = await db
      .select()
      .from(sqlLedgers)
      .innerJoin(sqlTenants, and(eq(sqlLedgers.tenantId, sqlTenants.tenantId)))
      .where(and(eq(sqlLedgers.ledgerId, req.ledgerId), eq(sqlLedgers.status, "active")))
      .get();
    if (!ledger) {
      return Result.Err("ledger not found");
    }
    const roles = await dbGetRoles(this, req.userId, [], [ledger.Ledgers]);
    if (roles.length > 1) {
      return Result.Err("multiple roles found");
    }
    if (roles.length && roles[0].role) {
      const ledgerUser = await db
        .select()
        .from(sqlLedgerUsers)
        .innerJoin(sqlLedgers, and(eq(sqlLedgerUsers.ledgerId, sqlLedgers.ledgerId)))
        .where(
          and(
            eq(sqlLedgerUsers.ledgerId, req.ledgerId),
            eq(sqlLedgerUsers.userId, req.userId),
            eq(sqlLedgerUsers.status, "active"),
          ),
        )
        .get();
      if (!ledgerUser) {
        return Result.Err("ref not found");
      }
      return Result.Ok({
        ledgerName: toUndef(ledgerUser.Ledgers.name),
        userName: toUndef(ledgerUser.LedgerUsers.name),
        ledgerId: ledgerUser.Ledgers.ledgerId,
        tenantId: ledgerUser.Ledgers.tenantId,
        userId: req.userId,
        default: !!ledgerUser.LedgerUsers.default,
        status: ledgerUser.LedgerUsers.status as UserStatus,
        statusReason: ledgerUser.LedgerUsers.statusReason,
        role: toRole(ledgerUser.LedgerUsers.role),
        right: toReadWrite(ledgerUser.LedgerUsers.right),
      });
    }
    const rCheck = await this.checkMaxRoles(ledger.Tenants, req.role);
    if (rCheck.isErr()) {
      return Result.Err(rCheck.Err());
    }
    const now = new Date().toISOString();
    if (req.default) {
      await db
        .update(sqlLedgerUsers)
        .set({
          default: 0,
          updatedAt: now,
        })
        .where(and(eq(sqlLedgerUsers.userId, req.userId), ne(sqlLedgerUsers.default, 0)))
        .run();
    }
    const ret = (
      await db
        .insert(sqlLedgerUsers)
        .values({
          ledgerId: ledger.Ledgers.ledgerId,
          userId: req.userId,
          name: req.userName,
          role: req.role,
          right: req.right,
          default: req.default ? 1 : 0,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
    )[0];
    return Result.Ok({
      ledgerName: ledger.Ledgers.name,
      userName: req.userName,
      ledgerId: ledger.Ledgers.ledgerId,
      tenantId: ledger.Ledgers.tenantId,
      status: ret.status as UserStatus,
      statusReason: ret.statusReason,
      userId: req.userId,
      default: req.default ?? false,
      role: toRole(ret.role),
      right: toReadWrite(ret.right),
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
      tenants: (
        await Promise.all(
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
            const roles = await dbGetRoles(this, t.TenantUsers.userId, [t.Tenants], []);
            if (roles.length > 1) {
              throw new Error("multiple roles found");
            }
            if (!roles.length) {
              return undefined;
            }
            switch (roles[0].role) {
              case "member":
                return {
                  ...common,
                  tenantId: t.TenantUsers.tenantId,
                  role: roles[0].role,
                  default: toBoolean(t.TenantUsers.default),
                };
              // case "owner":
              case "admin":
                return {
                  ...common,
                  tenantId: t.TenantUsers.tenantId,
                  role: roles[0].role,
                  default: toBoolean(t.TenantUsers.default),
                  adminUserIds: roles[0].adminUserIds,
                  memberUserIds: roles[0].memberUserIds,
                  maxAdminUsers: t.Tenants.maxAdminUsers,
                  maxMemberUsers: t.Tenants.maxMemberUsers,
                };
              default:
                throw new Error("invalid role");
            }
          }),
        )
      ).filter((t) => !!t),
    });
  }

  async getCloudSessionToken(req: ReqCloudSessionToken, ictx: Partial<FPTokenContext> = {}): Promise<Result<ResCloudSessionToken>> {
    const rCtx = await getFPTokenContext(this.sthis, ictx);
    if (rCtx.isErr()) {
      return Result.Err(rCtx.Err());
    }
    const ctx = rCtx.Ok();
    const rAuth = await this.activeUser(req);
    if (rAuth.isErr()) {
      return Result.Err(rAuth.Err());
    }
    const auth = rAuth.Ok();
    if (!isActiveUserWithUserId(auth)) {
      return Result.Err(new UserNotFoundError());
    }
    return dbGetCloudSessionToken(this, auth, req, ctx);
  }

  async redeemInvite(req: ReqRedeemInvite): Promise<Result<ResRedeemInvite>> {
    const rAuth = await this.activeUser(req);
    if (rAuth.isErr()) {
      return Result.Err(rAuth.Err());
    }
    const auth = rAuth.Ok();
    if (!isActiveUserWithUserId(auth)) {
      return Result.Err(new UserNotFoundError());
    }
    return Result.Ok({
      type: "resRedeemInvite",
      invites: sqlToInviteTickets(
        await Promise.all(
          (
            await this.findInvite({
              query: {
                byString: auth.verifiedAuth.params.email,
                byNick: auth.verifiedAuth.params.nick,
                existingUserId: auth.user.userId,
                // TODO
                // andProvider: auth.verifiedAuth.provider,
              },
            })
          )
            .filter((i) => i.status === "pending")
            .map(async (invite) => {
              if (invite.invitedParams.tenant) {
                const tenant = await this.db
                  .select()
                  .from(sqlTenants)
                  .where(and(eq(sqlTenants.tenantId, invite.invitedParams.tenant.id), eq(sqlTenants.status, "active")))
                  .get();
                if (!tenant) {
                  throw new Error("tenant not found");
                }
                if (!isActiveUserWithUserId(auth)) {
                  throw new UserNotFoundError();
                }
                await this.addUserToTenant(this.db, {
                  userName: `invited from [${tenant.name}]`,
                  tenantId: tenant.tenantId,
                  userId: auth.user?.userId,
                  role: invite.invitedParams.tenant.role,
                });
              }
              if (invite.invitedParams.ledger) {
                const ledger = await this.db
                  .select()
                  .from(sqlLedgers)
                  .where(and(eq(sqlLedgers.ledgerId, invite.invitedParams.ledger.id), eq(sqlLedgers.status, "active")))
                  .get();
                if (!ledger) {
                  throw new Error("ledger not found");
                }
                if (!isActiveUserWithUserId(auth)) {
                  throw new UserNotFoundError();
                }
                await this.addUserToLedger(this.db, {
                  userName: `invited-${ledger.name}`,
                  ledgerId: ledger.ledgerId,
                  tenantId: ledger.tenantId,
                  userId: auth.user?.userId,
                  role: invite.invitedParams.ledger.role,
                  right: invite.invitedParams.ledger.right,
                });
              }
              return (
                await this.db
                  .update(sqlInviteTickets)
                  .set({
                    invitedUserId: auth.user?.userId,
                    status: "accepted",
                    statusReason: `accepted: ${auth.user?.userId}`,
                    updatedAt: new Date().toISOString(),
                  })
                  .where(eq(sqlInviteTickets.inviteId, invite.inviteId))
                  .returning()
              )[0];
            }),
        ),
      ),
    });
  }

  async findUser(req: ReqFindUser): Promise<Result<ResFindUser>> {
    const rAuth = await this.activeUser(req);
    if (rAuth.isErr()) {
      return Result.Err(rAuth.Err());
    }
    const auth = rAuth.Ok();
    if (!isActiveUserWithUserId(auth)) {
      return Result.Err(new UserNotFoundError());
    }
    const rRows = await queryUser(this.db, req.query);
    return Result.Ok({
      type: "resFindUser",
      query: req.query,
      results: rRows.Ok(),
    });
  }

  private async createInviteTicket(
    userId: string,
    tenantId: string,
    ledgerId: string | undefined,
    req: ReqInviteUser,
  ): Promise<Result<InviteTicket>> {
    // check maxInvites
    const allowed = await this.db
      .select()
      .from(sqlTenants)
      .where(
        and(
          eq(sqlTenants.tenantId, tenantId),
          gt(sqlTenants.maxInvites, this.db.$count(sqlInviteTickets, eq(sqlInviteTickets.invitedTenantId, tenantId))),
        ),
      )
      .get();
    if (!allowed) {
      return Result.Err("max invites reached");
    }

    const found = await this.findInvite({ query: req.ticket.query, tenantId, ledgerId });
    if (found.length) {
      return Result.Err("invite already exists");
    }

    let ivp: InvitedParams = {};
    if (req.ticket.invitedParams?.ledger) {
      ivp = {
        ledger: {
          id: req.ticket.invitedParams?.ledger.id,
          role: req.ticket.invitedParams?.ledger.role ?? "member",
          right: req.ticket.invitedParams?.ledger.right ?? "read",
        },
      };
    }
    if (req.ticket.invitedParams?.tenant) {
      ivp = {
        tenant: {
          id: req.ticket.invitedParams?.tenant.id,
          role: req.ticket.invitedParams?.tenant.role ?? "member",
        },
      };
    }

    return Result.Ok(
      sqlToInviteTickets(
        await this.db
          .insert(sqlInviteTickets)
          .values(
            prepareInviteTicket({
              sthis: this.sthis,
              userId,
              invitedTicketParams: {
                query: req.ticket.query,
                status: "pending",
                invitedParams: ivp,
              },
            }),
          )
          .returning(),
      )[0],
    );
  }

  private async updateInviteTicket(
    userId: string,
    tenantId: string,
    ledgerId: string | undefined,
    req: ReqInviteUser,
  ): Promise<Result<InviteTicket>> {
    const found = await this.findInvite({ inviteId: req.ticket.inviteId });
    if (!found.length) {
      return Result.Err("invite not found");
    }
    const invite = found[0];
    if (invite.status !== "pending") {
      return Result.Err("invite not pending");
    }
    let ivp: InvitedParams = {};
    if (req.ticket.invitedParams?.ledger) {
      ivp = {
        ledger: {
          ...invite.invitedParams.ledger,
          ...req.ticket.invitedParams.ledger,
        },
      };
    }
    if (req.ticket.invitedParams?.tenant) {
      ivp = {
        tenant: {
          ...invite.invitedParams.tenant,
          ...req.ticket.invitedParams.tenant,
        },
      };
    }
    const toInsert = prepareInviteTicket({
      sthis: this.sthis,
      userId: userId,
      invitedTicketParams: {
        query: req.ticket.query,
        status: "pending",
        invitedParams: ivp,
      },
    });
    // might be update query
    return Result.Ok(
      sqlToInviteTickets(
        await this.db
          .update(sqlInviteTickets)
          .set({
            sendEmailCount: req.ticket.incSendEmailCount ? invite.sendEmailCount + 1 : invite.sendEmailCount,
            invitedParams: toInsert.invitedParams,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(sqlInviteTickets.inviteId, invite.inviteId))
          .returning(),
      )[0],
    );
  }

  async inviteUser(req: ReqInviteUser): Promise<Result<ResInviteUser>> {
    const rAuth = await this.activeUser(req);
    if (rAuth.isErr()) {
      return Result.Err(rAuth.Err());
    }
    const auth = rAuth.Ok();
    if (!isActiveUserWithUserId(auth)) {
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

    if (
      req.ticket.invitedParams?.ledger &&
      req.ticket.invitedParams?.tenant &&
      !req.ticket.invitedParams?.ledger &&
      !req.ticket.invitedParams?.tenant
    ) {
      return Result.Err("either ledger or tenant must be set");
    }
    let tenantId: string | undefined;
    let ledgerId: string | undefined;
    if (req.ticket.invitedParams?.ledger) {
      const ledger = await this.db
        .select()
        .from(sqlLedgers)
        .where(eq(sqlLedgers.ledgerId, req.ticket.invitedParams.ledger.id))
        .get();
      if (!ledger) {
        return Result.Err("ledger not found");
      }
      ledgerId = ledger.ledgerId;
      tenantId = ledger.tenantId;
    }
    if (req.ticket.invitedParams?.tenant) {
      const tenant = await this.db
        .select()
        .from(sqlTenants)
        .where(eq(sqlTenants.tenantId, req.ticket.invitedParams.tenant.id))
        .get();
      if (!tenant) {
        return Result.Err("tenant not found");
      }
      tenantId = tenant.tenantId;
    }
    if (!tenantId) {
      return Result.Err("tenant not found");
    }

    let inviteTicket: InviteTicket;
    if (!req.ticket.inviteId) {
      const rInviteTicket = await this.createInviteTicket(auth.user.userId, tenantId, ledgerId, req);
      if (rInviteTicket.isErr()) {
        return Result.Err(rInviteTicket.Err());
      }
      inviteTicket = rInviteTicket.Ok();
    } else {
      const rInviteTicket = await this.updateInviteTicket(auth.user.userId, tenantId, ledgerId, req);
      if (rInviteTicket.isErr()) {
        return Result.Err(rInviteTicket.Err());
      }
      inviteTicket = rInviteTicket.Ok();
    }
    return Result.Ok({
      type: "resInviteUser",
      invite: inviteTicket,
    });
  }

  private async findInvite(req: {
    query?: QueryUser;
    inviteId?: string;
    tenantId?: string;
    ledgerId?: string;
    // now?: Date
  }): Promise<InviteTicket[]> {
    if (!(req.inviteId || req.query)) {
      throw new Error("inviteId or query is required");
    }
    if (req.tenantId && req.ledgerId) {
      throw new Error("invite only possible to ledger or tenant");
    }
    // housekeeping
    await this.db
      .update(sqlInviteTickets)
      .set({ status: "expired" })
      .where(and(eq(sqlInviteTickets.status, "pending"), lt(sqlInviteTickets.expiresAfter, new Date().toISOString())))
      .run();
    let condition = and();
    // eq(sqlInviteTickets.status, "pending"),
    // gt(sqlInviteTickets.expiresAfter, (req.now ?? new Date()).toISOString()),

    if (req.tenantId) {
      condition = and(eq(sqlInviteTickets.invitedTenantId, req.tenantId), condition);
    }
    if (req.ledgerId) {
      condition = and(eq(sqlInviteTickets.invitedLedgerId, req.ledgerId), condition);
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
    return sqlToInviteTickets(rows);
  }

  /**
   *
   * @description list invites for a user if user is owner of tenant or admin of tenant
   */
  async listInvites(req: ReqListInvites): Promise<Result<ResListInvites>> {
    // console.log(`xxxxx`)
    const rAuth = await this.activeUser(req);
    if (rAuth.isErr()) {
      return Result.Err(rAuth.Err());
    }
    const auth = rAuth.Ok();
    if (!isActiveUserWithUserId(auth)) {
      return Result.Err(new UserNotFoundError());
    }
    let tenantCond = and(eq(sqlTenantUsers.userId, auth.user.userId), eq(sqlTenantUsers.status, "active"));
    if (req.tenantIds?.length) {
      tenantCond = and(inArray(sqlTenantUsers.tenantId, req.tenantIds), tenantCond);
    }
    const tenants = await this.db
      .select()
      .from(sqlTenantUsers)
      .innerJoin(sqlTenants, and(eq(sqlTenants.tenantId, sqlTenantUsers.tenantId), eq(sqlTenants.status, "active")))
      .where(tenantCond)
      .all();

    let ledgerCond = and(eq(sqlLedgerUsers.userId, auth.user.userId), eq(sqlLedgerUsers.status, "active"));
    if (req.ledgerIds?.length) {
      ledgerCond = and(inArray(sqlLedgerUsers.ledgerId, req.ledgerIds), ledgerCond);
    }
    const ledgers = await this.db
      .select()
      .from(sqlLedgerUsers)
      .innerJoin(sqlLedgers, and(eq(sqlLedgers.ledgerId, sqlLedgerUsers.ledgerId), eq(sqlLedgers.status, "active")))
      .where(ledgerCond)
      .all();

    if (!tenants.length && !ledgers.length) {
      return Result.Ok({
        type: "resListInvites",
        tickets: [],
      });
    }

    const roles = await dbGetRoles(
      this,
      auth.user.userId,
      tenants.map((i) => i.Tenants),
      ledgers.map((i) => i.Ledgers),
    );
    // list invites from all tenants where i'm owner or admin
    const invites = await this.db
      .select()
      .from(sqlInviteTickets)
      .where(
        or(
          inArray(
            sqlInviteTickets.invitedTenantId,
            roles
              .filter((i) => i.role === "admin" && i.tenantId)
              .map((i) => i.tenantId as string)
              .flat(2),
          ),
          inArray(
            sqlInviteTickets.invitedLedgerId,
            roles
              .filter((i) => i.role === "admin" && i.ledgerId)
              .map((i) => i.ledgerId as string)
              .flat(2),
          ),
        ),
      );
    return Result.Ok({
      type: "resListInvites",
      tickets: sqlToInviteTickets(invites),
    });

    // list invites from all ledgers where i'm owner or admin

    // this.db.select()
    //   .from(sqlTenants)
    //   .innerJoin(sqlTenantUsers, and(
    //       eq(sqlTenantUsers.userId, auth.user.userId),
    //       eq(sqlTenants.tenantId, sqlTenantUsers.tenantId),
    //     ))
    //   .innerJoin(sqlTenantUserRoles, and(
    //     eq(sqlTenantUsers.userId, auth.user.userId),
    //     eq(sqlTenants.tenantId, sqlTenantUsers.tenantId)
    //   ))
    //   .where(
    //     eq(sqlTenants.ownerUserId, auth.user.userId)
    // ).all();

    // this.db.select().from(sqlInviteTickets)
    //   .where(
    //     eq(sqlInviteTickets.inviterUserId, auth.user.userId)
    //   )
    //   .all();

    // let rows: (typeof sqlInviteTickets.$inferSelect)[];
    // const ownerTenants = await this.db
    //   .select()
    //   .from(sqlTenants)
    //   .where(eq(sqlTenants.ownerUserId, auth.user.userId))
    //   .all()
    //   .then((rows) => rows.map((row) => row.tenantId));
    // // get admin in tenant for this user
    // let condition = and(eq(sqlTenantUserRoles.userId, auth.user.userId), eq(sqlTenantUserRoles.role, "admin"));
    // if (req.tenantIds.length) {
    //   // filter by tenantIds if set
    //   condition = and(inArray(sqlTenantUserRoles.tenantId, req.tenantIds), condition);
    // }
    // const adminTenants = await this.db
    //   .select()
    //   .from(sqlTenantUserRoles)
    //   .where(condition)
    //   .all()
    //   .then((rows) => rows.map((row) => row.tenantId));
    // const setTenants = new Set(req.tenantIds);
    // const filterAdminTenants = Array.from(new Set([...ownerTenants, ...adminTenants, ...req.tenantIds])).filter((x) => {
    //   return setTenants.size ? setTenants.has(x) : true;
    // });
    // // console.log(">>>>", filterAdminTenants);
    // rows = await this.db
    //   .select()
    //   .from(sqlInviteTickets)
    //   .where(
    //     and(
    //       inArray(sqlInviteTickets.invitedTenantId, filterAdminTenants),
    //       // inArray(inviteTickets.inv, req.tenantIds)
    //     ),
    //   )
    //   .all();
    // // }
    // return Result.Ok({
    //   type: "resListInvites",
    //   tickets: Array.from(
    //     rows
    //       .reduce((acc, row) => {
    //         if (!row.inviterTenantId) {
    //           throw new Error("inviterTenantId is required");
    //         }
    //         const invites = acc.get(row.inviterTenantId) ?? [];
    //         invites.push(sqlToInvite(row));
    //         acc.set(row.inviterTenantId, invites);
    //         return acc;
    //       }, new Map<string, InviteTicket[]>())
    //       .entries(),
    //   )
    //     .map(([tenantId, invites]) => ({
    //       tenantId,
    //       invites,
    //     }))
    //     .filter((x) => x.invites.length),
    // });
  }

  async deleteInvite(req: ReqDeleteInvite): Promise<Result<ResDeleteInvite>> {
    const rAuth = await this.activeUser(req);
    if (rAuth.isErr()) {
      return Result.Err(rAuth.Err());
    }
    const auth = rAuth.Ok();
    if (!isActiveUserWithUserId(auth)) {
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
    if (!isActiveUserWithUserId(auth)) {
      return Result.Err(new UserNotFoundError());
    }
    const userId = req.userId ?? auth.user.userId;
    if (req.role && (await isAdminOfTenant(this, userId, req.tenantId))) {
      await this.db
        .update(sqlTenantUsers)
        .set({
          role: req.role,
        })
        .where(and(eq(sqlTenantUsers.userId, userId), eq(sqlTenantUsers.tenantId, req.tenantId)))
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
      await this.db
        .update(sqlTenantUsers)
        .set(updateSet)
        .where(and(eq(sqlTenantUsers.userId, userId), eq(sqlTenantUsers.tenantId, req.tenantId)))
        .returning();
    }
    const ret = await this.db
      .select()
      .from(sqlTenantUsers)
      .innerJoin(
        sqlTenantUsers,
        and(eq(sqlTenantUsers.userId, sqlTenantUsers.userId), eq(sqlTenantUsers.tenantId, sqlTenantUsers.tenantId)),
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
      role: toRole(ret.TenantUsers.role),
      default: !!ret.TenantUsers.default,
      name: toUndef(ret.TenantUsers.name),
    });
  }

  async createTenant(req: ReqCreateTenant): Promise<Result<ResCreateTenant>> {
    const rAuth = await this.activeUser(req);
    if (rAuth.isErr()) {
      return Result.Err(rAuth.Err());
    }
    const auth = rAuth.Ok();
    if (!isActiveUserWithUserId(auth)) {
      return Result.Err(new UserNotFoundError());
    }
    const rTenant = await dbInsertTenant(this, auth as ActiveUserWithUserId, {
      ...req.tenant,
      ownerUserId: auth.user.userId,
    });
    if (rTenant.isErr()) {
      return Result.Err(rTenant.Err());
    }
    const tenant = rTenant.Ok();
    await this.addUserToTenant(this.db, {
      userName: nameFromAuth(req.tenant.name, auth as ActiveUserWithUserId),
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

  async updateTenant(req: ReqUpdateTenant): Promise<Result<ResUpdateTenant>> {
    const rAuth = await this.activeUser(req);
    if (rAuth.isErr()) {
      return Result.Err(rAuth.Err());
    }
    const auth = rAuth.Ok();
    if (!isActiveUserWithUserId(auth)) {
      return Result.Err(new UserNotFoundError());
    }
    const prev = await this.db.select().from(sqlTenants).where(eq(sqlTenants.tenantId, req.tenant.tenantId)).get();
    if (!prev) {
      return Result.Err("tenant not found");
    }
    if (!(await isAdminOfTenant(this, auth.user.userId, req.tenant.tenantId))) {
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

  async deleteTenant(req: ReqDeleteTenant): Promise<Result<ResDeleteTenant>> {
    const rAuth = await this.activeUser(req);
    if (rAuth.isErr()) {
      return Result.Err(rAuth.Err());
    }
    const auth = rAuth.Ok();
    if (!isActiveUserWithUserId(auth)) {
      return Result.Err(new UserNotFoundError());
    }
    // check if owner or admin of tenant
    if (!(await isAdminOfTenant(this, auth.user.userId, req.tenantId))) {
      return Result.Err("not owner or admin of tenant");
    }
    // TODO remove ledgers
    await this.db.delete(sqlInviteTickets).where(eq(sqlInviteTickets.invitedTenantId, req.tenantId)).run();
    await this.db.delete(sqlTenantUsers).where(eq(sqlTenantUsers.tenantId, req.tenantId)).run();
    await this.db.delete(sqlTenants).where(eq(sqlTenants.tenantId, req.tenantId)).run();
    return Result.Ok({
      type: "resDeleteTenant",
      tenantId: req.tenantId,
    });
  }

  async createLedger(req: ReqCreateLedger): Promise<Result<ResCreateLedger>> {
    const rAuth = await this.activeUser(req);
    if (rAuth.isErr()) {
      return Result.Err(rAuth.Err());
    }
    const auth = rAuth.Ok();
    if (!isActiveUserWithUserId(auth)) {
      return Result.Err(new UserNotFoundError());
    }
    // check if owner or admin of tenant
    if (!(await isAdminOfTenant(this, auth.user.userId, req.ledger.tenantId))) {
      return Result.Err("not owner or admin of tenant");
    }

    const allowed = await this.db
      .select()
      .from(sqlTenants)
      .where(
        and(
          eq(sqlTenants.tenantId, req.ledger.tenantId),
          gt(sqlTenants.maxLedgers, this.db.$count(sqlLedgers, eq(sqlLedgers.tenantId, req.ledger.tenantId))),
        ),
      )
      .get();
    if (!allowed) {
      return Result.Err("max ledgers per tenant reached");
    }

    const ledgerId = this.sthis.nextId(12).str;
    const now = new Date().toISOString();
    const ledger = await this.db
      .insert(sqlLedgers)
      .values({
        ledgerId,
        tenantId: req.ledger.tenantId,
        ownerId: auth.user.userId,
        name: req.ledger.name,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    const roles = await this.db
      .insert(sqlLedgerUsers)
      .values({
        ledgerId: ledgerId,
        userId: auth.user.userId,
        role: "admin",
        name: req.ledger.name,
        default: 0,
        right: "write",
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return Result.Ok({
      type: "resCreateLedger",
      ledger: sqlToLedgers([{ Ledgers: ledger[0], LedgerUsers: roles[0] }])[0],
    });
  }

  async deleteLedger(req: ReqDeleteLedger): Promise<Result<ResDeleteLedger>> {
    const rAuth = await this.activeUser(req);
    if (rAuth.isErr()) {
      return Result.Err(rAuth.Err());
    }
    const auth = rAuth.Ok();
    if (!isActiveUserWithUserId(auth)) {
      return Result.Err(new UserNotFoundError());
    }
    // const now = new Date().toISOString();
    // check if owner or admin of tenant
    if (!(await isAdminOfLedger(this, auth.user.userId, req.ledger.ledgerId))) {
      return Result.Err("not owner or admin of tenant");
    }
    await this.db.delete(sqlLedgerUsers).where(eq(sqlLedgerUsers.ledgerId, req.ledger.ledgerId)).run();
    await this.db.delete(sqlLedgers).where(eq(sqlLedgers.ledgerId, req.ledger.ledgerId)).run();
    return Result.Ok({
      type: "resDeleteLedger",
      ledgerId: req.ledger.ledgerId,
    });
  }

  async updateLedger(req: ReqUpdateLedger): Promise<Result<ResUpdateLedger>> {
    const rAuth = await this.activeUser(req);
    if (rAuth.isErr()) {
      return Result.Err(rAuth.Err());
    }
    const auth = rAuth.Ok();
    if (!isActiveUserWithUserId(auth)) {
      return Result.Err(new UserNotFoundError());
    }
    return dbUpdateLedger(this, auth, req);
  }

  async listLedgersByUser(req: ReqListLedgersByUser): Promise<Result<ResListLedgersByUser>> {
    const rAuth = await this.activeUser(req);
    if (rAuth.isErr()) {
      return Result.Err(rAuth.Err());
    }
    const auth = rAuth.Ok();
    if (!isActiveUserWithUserId(auth)) {
      return Result.Err(new UserNotFoundError());
    }
    return dbListLedgersByUser(this, auth, req);
  }

  // this is why to expensive --- why not kv or other simple storage
  async getTokenByResultId(req: ReqTokenByResultId): Promise<Result<ResTokenByResultId>> {
    const past = new Date(new Date().getTime() - 15 * 60 * 1000).toISOString();
    const out = await this.db
      .select()
      .from(sqlTokenByResultId)
      .where(and(eq(sqlTokenByResultId.resultId, req.resultId), gte(sqlTokenByResultId.updatedAt, past)))
      .get();
    if (!out || out.status !== "found" || !out.token) {
      return Result.Ok({
        type: "resTokenByResultId",
        resultId: req.resultId,
        status: "not-found",
      });
    }
    await this.db.delete(sqlTokenByResultId).where(eq(sqlTokenByResultId.resultId, req.resultId)).run();
    return Result.Ok({
      type: "resTokenByResultId",
      resultId: out.resultId,
      token: out.token,
      status: "found",
    });
  }

  /**
   * Extract token from request, validate it, and extend expiry by 1 day
   */
  async extendToken(req: ReqExtendToken, ictx: Partial<FPTokenContext> = {}): Promise<Result<ResExtendToken>> {
    const rCtx = await getFPTokenContext(this.sthis, ictx);
    if (rCtx.isErr()) {
      return Result.Err(rCtx.Err());
    }
    const ctx = rCtx.Ok();
    try {
      // Get the public key for verification
      const pubKey = await sts.env2jwk(ctx.publicToken, "ES256");

      // Verify the token
      const verifyResult = await jwtVerify(req.token, pubKey, {
        issuer: ctx.issuer,
        audience: ctx.audience,
      });
      const payload = verifyResult.payload as FPUserToken;

      // Check if token is expired
      const now = Date.now();
      if (!payload.exp || payload.exp * 1000 <= now) {
        return Result.Err("Token is expired");
      }
      // Create new token with extended expiry using the private key
      // JWT expects expiration time in seconds, not milliseconds
      const newToken = await createFPToken(
        {
          ...ctx,
          validFor: ctx.extendValidFor,
        },
        payload,
      );
      return Result.Ok({
        type: "resExtendToken",
        token: newToken,
      });
    } catch (error) {
      return Result.Err(`Token validation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

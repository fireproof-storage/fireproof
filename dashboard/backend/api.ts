import { Result } from "@adviser/cement";
import { SuperThis } from "@fireproof/core";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import type { SQLiteTransaction } from "drizzle-orm/sqlite-core";
import type { ResultSet } from "@libsql/client";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import { eq, and } from "drizzle-orm/expressions";
import { tenants, tenantUserRefRoles, tenantUserRefs, userRefs } from "./db-api-schema.js";
import { a } from "vitest/dist/chunks/suite.B2jumIFP.js";
import { au } from "vitest/dist/chunks/reporters.D7Jzd9GS.js";

export interface AuthType {
  readonly type: "ucan" | "clerk";
  readonly token: string;
}

export interface VerifiedAuth {
  readonly type: "clerk";
  readonly token: string;
  readonly userId: string;
  readonly provider: string;
}

export interface ClerkClaim {
  readonly email: string;
  readonly first: string;
  readonly last: string;
  // github handle
  readonly nick: string;
}

export interface ClerkVerifyAuth extends VerifiedAuth {
  readonly params: ClerkClaim;
}

export interface ReqEnsureUserRef {
  readonly type: "reqEnsureUserRef";
  readonly auth: AuthType;
}

export interface Tenant {
  readonly tenantId: string;
  readonly name: string;
  readonly ownerUserRefId: string;
  readonly adminUserRefIds: string[];
  readonly memberUserRefIds: string[];
  readonly maxAdminUserRefs: number;
  readonly maxMemberUserRefs: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// export interface TenantUserRef {
//     readonly userRefId: string;
//     readonly tenantId: string;
//     readonly name: string;
//     readonly active: boolean; // active for this user
// }

export interface ResEnsureUserRef {
  readonly type: "resEnsureUserRef";
  readonly userRefId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly queryEmail?: string;
  readonly queryNick?: string;
  readonly params: ClerkClaim;
  readonly authUserId: string;
  readonly authProvider: string;
  readonly tenants: UserTenant[];
  readonly maxTenants: number;
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

export interface UserTenant {
  readonly tenantId: string;
  readonly tenantName?: string;
  readonly name?: string;
  readonly role: Role;
  readonly default: boolean;
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

export interface QueryUserRef {
  readonly byEmail?: string; // exact email
  readonly byNick?: string; // exact nick
  readonly andProvider?: "github" | "google" | "fp";
}

export interface ReqFindUserRef {
  readonly type: "reqFindUserRef";
  readonly auth: AuthType;
  readonly query: QueryUserRef;
}

export interface QueryResultUserRef {
  readonly userRefId: string;
  readonly authProvider: string;
  readonly email?: string;
  readonly nick?: string;
  readonly provider: "github" | "google" | "fp";
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ResFindUserRef {
  readonly type: "resFindUserRef";
  // readonly userRefId: string;
  // readonly authUserId: string;
  readonly query: QueryUserRef;
  readonly results: QueryResultUserRef[];
}

export interface ReqInviteUser {
  readonly type: "reqInviteUser";
  readonly auth: AuthType;
  readonly query: QueryUserRef;
  readonly inviterTenantId?: string;
  // to update
  readonly inviteId?: string;
  readonly incSendEmailCount?: boolean;
  readonly target: {
    readonly tenant?: {
      readonly id: string;
      readonly role: "admin" | "member";
    };
    readonly ledger?: {
      readonly id: string;
      readonly role: "admin" | "member";
      readonly right: "read" | "write";
    };
  };
}

export interface Invite {
  readonly inviteId: string;
  readonly sendEmailCount: number;
  readonly inviterUserRefId: string;
  readonly target: {
    readonly tenant?: {
      readonly id: string;
      readonly role: "admin" | "member";
    };
    readonly ledger?: {
      readonly id: string;
      readonly role: "admin" | "member";
      readonly right: "read" | "write";
    };
  };
  readonly expiresAfter: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ResInviteUser {
  readonly type: "resInviteUser";
  readonly invite: Invite;
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
  readonly invites: [
    {
      readonly tenantId: string;
      readonly invites: Invite[];
    },
  ];
}

export interface FPApi {
  ensureUserRef(req: ReqEnsureUserRef): Promise<Result<ResEnsureUserRef>>;

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

function prepareInsertUserRef(req: ReqInsertUserRef) {
  const now = new Date();
  const user: typeof userRefs.$inferInsert = {
    userRefId: req.userRefId,
    authUserId: req.auth.userId,
    authProvider: req.auth.provider,
    queryEmail: queryEmail(req.auth.params.email),
    queryNick: queryNick(req.auth.params.nick),
    maxTenants: req.maxTenants ?? 5,
    params: JSON.stringify(req.auth.params),
    createdAt: (req.createdAt ?? now).toISOString(),
    updatedAt: (req.updatedAt ?? req.createdAt ?? now).toISOString(),
  };
  return user;
}

function prepareInsertTenant(req: ReqInsertTenant) {
  const now = new Date();
  const tenant: typeof tenants.$inferInsert = {
    tenantId: req.tenantId,
    name: req.name,
    ownerUserRefId: req.ownerUserRefId,
    // adminUserRefIds: JSON.stringify(req.adminUserRefIds ?? []),
    // memberUserRefIds: JSON.stringify(req.adminUserRefIds ?? []),
    maxAdminUserRefs: req.maxAdminUserRefs ?? 5,
    maxMemberUserRefs: req.maxMemberUserRefs ?? 5,
    createdAt: (req.createdAt ?? now).toISOString(),
    updatedAt: (req.updatedAt ?? req.createdAt ?? now).toISOString(),
  };
  return tenant;
  // await this.db.insert(tenants).values(tenant).run();
  // return Result.Ok({
  //     tenantId: tenant.tenantId,
  //     name: tenant.name,
  //     ownerUserRefId: tenant.ownerUserRefId,
  //     adminUserRefIds: JSON.parse(tenant.adminUserRefIds),
  //     memberUserRefIds: JSON.parse(tenant.memberUserRefIds),
  //     maxAdminUserRefs: tenant.maxAdminUserRefs,
  //     maxMemberUserRefs: tenant.maxMemberUserRefs,
  //     createdAt: new Date(tenant.createdAt),
  //     updatedAt: new Date(tenant.updatedAt),
  // });
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

function toUndef(v: string | null | undefined): string | undefined {
  return v ? v : undefined;
}

function toBoolean(v: number): boolean {
  return !!v;
}

type SQLTransaction = SQLiteTransaction<
  "async",
  ResultSet,
  Record<string, never>,
  ExtractTablesWithRelations<Record<string, never>>
>;

export class FPApiImpl implements FPApi {
  readonly db: LibSQLDatabase;
  readonly tokenApi: FPApiToken;
  readonly sthis: SuperThis;
  constructor(sthis: SuperThis, db: LibSQLDatabase, token: FPApiToken) {
    this.db = db;
    this.tokenApi = token;
    this.sthis = sthis;
  }

  private async authToClerkVerifyAuth(req: { readonly auth: AuthType }): Promise<Result<ClerkVerifyAuth>> {
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

  async ensureUserRef(req: ReqEnsureUserRef): Promise<Result<ResEnsureUserRef>> {
    const rAuth = await this.authToClerkVerifyAuth(req);
    if (rAuth.isErr()) {
      return Result.Err(rAuth.Err());
    }
    const auth = rAuth.Ok();
    const existing = await this.db.select().from(userRefs).where(eq(userRefs.authUserId, auth.userId)).get();
    if (!existing) {
      const userRefId = this.sthis.nextId(12).str;
      await this.db
        .insert(userRefs)
        .values(
          prepareInsertUserRef({
            userRefId,
            auth,
          }),
        )
        .run();
      const tenantId = this.sthis.nextId(12).str;
      await this.db
        .insert(tenants)
        .values(
          prepareInsertTenant({
            tenantId,
            name: `my-tenant[${auth.params.email ?? auth.params.nick}]`,
            ownerUserRefId: userRefId,
          }),
        )
        .run();
      // await this.db.transaction(async (db) => {
      await this.addUserToTenant(this.db, {
        name: `my-tenant[${auth.params.email ?? auth.params.nick}]`,
        tenantId,
        userRefId,
        role: "admin",
        default: true,
      });
      // });
      return this.ensureUserRef(req);
    }
    return Result.Ok({
      ...existing,
      queryEmail: toUndef(existing.queryEmail),
      queryNick: toUndef(existing.queryNick),
      params: JSON.parse(existing.params as string),
      createdAt: new Date(existing.createdAt),
      updatedAt: new Date(existing.updatedAt),
      type: "resEnsureUserRef",
      maxTenants: existing.maxTenants,
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
      active: 1,
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
    const rAuth = await this.authToClerkVerifyAuth(req);
    if (rAuth.isErr()) {
      return Result.Err(rAuth.Err());
    }
    const auth = rAuth.Ok();
    const tenantUserRef = await this.db
      .select()
      .from(tenantUserRefs)
      .innerJoin(tenants, eq(tenantUserRefs.tenantId, tenants.tenantId))
      .innerJoin(userRefs, eq(tenants.ownerUserRefId, userRefs.userRefId))
      .where(eq(userRefs.authUserId, auth.userId))
      .all();
    // console.log(">>>>>", tenantUserRef);
    return Result.Ok({
      type: "resListTenantsByUser",
      userRefId: tenantUserRef[0].UserRefs.userRefId,
      authUserId: auth.userId,
      tenants: await Promise.all(
        tenantUserRef.map(async (t) => {
          const role = await this.getRole(t.TenantUserRefs.userRefId, t.Tenants);
          switch (role.role) {
            case "member":
              return {
                tenantId: t.TenantUserRefs.tenantId,
                tenantName: toUndef(t.Tenants.name),
                name: toUndef(t.TenantUserRefs.name),
                role: role.role,
                default: toBoolean(t.TenantUserRefs.default),
              };
            case "owner":
            case "admin":
              return {
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
    const rAuth = await this.authToClerkVerifyAuth(req);
    if (rAuth.isErr()) {
      return Result.Err(rAuth.Err());
    }
    const auth = rAuth.Ok();
    let where: ReturnType<typeof and>;
    const byEmail = queryEmail(req.query.byEmail);
    const byNick = queryNick(req.query.byNick);
    if (byEmail && byNick && req.query.andProvider) {
      where = and(
        eq(userRefs.queryEmail, byEmail),
        eq(userRefs.queryNick, byNick),
        eq(userRefs.authProvider, req.query.andProvider),
      );
    } else if (byEmail && byNick) {
      where = and(eq(userRefs.queryEmail, byEmail), eq(userRefs.queryNick, byNick));
    } else if (byEmail && req.query.andProvider) {
      where = and(eq(userRefs.queryEmail, byEmail), eq(userRefs.authProvider, req.query.andProvider));
    } else if (byNick && req.query.andProvider) {
      where = and(eq(userRefs.queryNick, byNick), eq(userRefs.authProvider, req.query.andProvider));
    } else if (byEmail) {
      where = eq(userRefs.queryEmail, byEmail);
    } else if (byNick) {
      where = eq(userRefs.queryNick, byNick);
    }
    if (!where) {
      return Result.Err("invalid query");
    }
    const rows = await this.db.select().from(userRefs).where(where).all();
    return Result.Ok({
      type: "resFindUserRef",
      query: req.query,
      results: rows.map(
        (row) =>
          ({
            userRefId: row.userRefId,
            authProvider: row.authProvider,
            email: row.queryEmail as string,
            nick: row.queryNick as string,
            provider: row.authProvider,
            createdAt: new Date(row.createdAt),
            updatedAt: new Date(row.updatedAt),
          }) as QueryResultUserRef,
      ),
    });
  }

  async inviteUser(req: ReqInviteUser): Promise<Result<ResInviteUser>> {
    throw new Error("Method not implemented.");
  }

  async listInvites(req: ReqListInvites): Promise<Result<ResListInvites>> {
    throw new Error("Method not implemented.");
  }

  async removeInvite(req: ReqRemoveInvite): Promise<Result<ResRemoveInvite>> {
    throw new Error("Method not implemented.");
  }
}

export function queryNick(nick?: string): string | undefined {
  if (!nick) {
    return undefined;
  }
  nick = nick.trim().toLowerCase();
  return nick === "" ? undefined : nick;
}

export function queryEmail(email?: string): string | undefined {
  if (!email) {
    return undefined;
  }
  const splitEmail = email
    .trim()
    .toLowerCase()
    .match(/^([^@]+)@([^@]+)$/);
  if (!splitEmail) {
    return undefined;
  }
  return splitEmail[1].replace(/[^a-z0-9]/g, "") + "@" + splitEmail[2];
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

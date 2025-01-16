import { Result } from "@adviser/cement";
import { SuperThis } from "@fireproof/core";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import type { SQLiteTransaction } from "drizzle-orm/sqlite-core";
import type { ResultSet } from "@libsql/client";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import { eq, and } from "drizzle-orm/expressions";
import { tenants, tenantUserRefs, userRefs } from "./db-api-schema.js";

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
  readonly name: string;
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

export interface FPApi {
  ensureUserRef(req: ReqEnsureUserRef): Promise<Result<ResEnsureUserRef>>;

  listTenantsByUser(req: ReqListTenantsByUser): Promise<Result<ResListTenantsByUser>>;
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
    adminUserRefIds: JSON.stringify(req.adminUserRefIds ?? []),
    memberUserRefIds: JSON.stringify(req.adminUserRefIds ?? []),
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

function getRole(
  userRefId: string,
  tenant: typeof tenants.$inferSelect,
): {
  role: Role;
  foundRole: boolean;
  adminUserRefIds: string[];
  memberUserRefIds: string[];
} {
  const adminUserRefIds = JSON.parse(tenant.adminUserRefIds as string);
  const memberUserRefIds = JSON.parse(tenant.memberUserRefIds as string);
  const isAdmin = adminUserRefIds.includes(userRefId);
  const isMember = memberUserRefIds.includes(userRefId);
  return {
    adminUserRefIds,
    memberUserRefIds,
    foundRole: isAdmin || isMember,
    role: tenant.ownerUserRefId === userRefId ? "owner" : isAdmin ? "admin" : "member",
  };
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
            name: `my-tenant[${auth.params.email ?? auth.params.name}]`,
            ownerUserRefId: userRefId,
          }),
        )
        .run();
      // await this.db.transaction(async (db) => {
      await this.addUserToTenant(this.db, {
        name: `my-tenant[${auth.params.email ?? auth.params.name}]`,
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
    const role = getRole(req.userRefId, tenant);
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
      .update(tenants)
      .set({
        adminUserRefIds: JSON.stringify(role.adminUserRefIds),
        memberUserRefIds: JSON.stringify(role.memberUserRefIds),
        updatedAt: now,
      })
      .where(eq(tenants.tenantId, tenant.tenantId))
      .run();
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
      userRefId: tenantUserRef[0].TenantUserRefs.userRefId,
      authUserId: auth.userId,
      tenants: tenantUserRef.map((t) => {
        const role = getRole(t.TenantUserRefs.userRefId, t.Tenants).role;
        switch (role) {
          case "member":
            return {
              tenantId: t.TenantUserRefs.tenantId,
              tenantName: toUndef(t.Tenants.name),
              name: toUndef(t.TenantUserRefs.name),
              role,
              default: toBoolean(t.TenantUserRefs.default),
            };
          case "owner":
          case "admin":
            return {
              tenantId: t.TenantUserRefs.tenantId,
              tenantName: toUndef(t.Tenants.name),
              name: toUndef(t.TenantUserRefs.name),
              role,
              default: toBoolean(t.TenantUserRefs.default),
              adminUserRefIds: JSON.parse(t.Tenants.adminUserRefIds as string),
              memberUserRefIds: JSON.parse(t.Tenants.memberUserRefIds as string),
              maxAdminUserRefs: t.Tenants.maxAdminUserRefs,
              maxMemberUserRefs: t.Tenants.maxMemberUserRefs,
            };
        }
      }),
    });
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
}

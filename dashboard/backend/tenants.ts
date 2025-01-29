import { int, sqliteTable, text, primaryKey, index } from "drizzle-orm/sqlite-core";
import { sqlUsers } from "./users.ts";

export const sqlTenants = sqliteTable("Tenants", {
  tenantId: text().primaryKey(),
  name: text().notNull(),
  ownerUserId: text()
    .notNull()
    .references(() => sqlUsers.userId),
  maxAdminUsers: int().notNull().default(5),
  maxMemberUsers: int().notNull().default(5),
  maxInvites: int().notNull().default(10),
  maxLedgers: int().notNull().default(5),
  status: text().notNull().default("active"),
  statusReason: text().notNull().default("just created"),
  createdAt: text().notNull(),
  updatedAt: text().notNull(),
});

// export const sqlTenantUserRoles = sqliteTable(
//   "TenantUserRoles",
//   {
//     tenantId: text()
//       .notNull()
//       .references(() => sqlTenants.tenantId),
//     userId: text()
//       .notNull()
//       .references(() => sqlUsers.userId),
//   },
//   (table) => [
//     primaryKey({ columns: [table.tenantId, table.userId] }),
//     index("turUserIdx").on(table.userId), // to enable delete by userRefId
//   ],
// );

export const sqlTenantUsers = sqliteTable(
  "TenantUsers",
  {
    userId: text()
      .notNull()
      .references(() => sqlUsers.userId),
    tenantId: text()
      .notNull()
      .references(() => sqlTenants.tenantId),
    name: text(),
    role: text().notNull(), // "admin" | "member"
    status: text().notNull().default("active"),
    statusReason: text().notNull().default("just created"),
    default: int().notNull(), // order for the user
    createdAt: text().notNull(),
    updatedAt: text().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.tenantId] })],
);

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

// export interface InsertTenantParam {
//   readonly tenantId: string;
//   readonly name: string;
//   readonly ownerUserRefId: string;
//   readonly adminUserRefIds?: string[];
//   readonly memberUserRefIds?: string[];
//   readonly maxAdminUserRefs?: number;
//   readonly maxMemberUserRefs?: number;
//   readonly createdAt?: Date;
//   readonly updatedAt?: Date;
// }

// export function prepareInsertTenant(req: InsertTenantParam) {
//   const now = new Date();
//   const tenant: typeof tenants.$inferInsert = {
//     tenantId: req.tenantId,
//     name: req.name,
//     ownerUserRefId: req.ownerUserRefId,
//     // adminUserRefIds: JSON.stringify(req.adminUserRefIds ?? []),
//     // memberUserRefIds: JSON.stringify(req.adminUserRefIds ?? []),
//     maxAdminUserRefs: req.maxAdminUserRefs ?? 5,
//     maxMemberUserRefs: req.maxMemberUserRefs ?? 5,
//     createdAt: (req.createdAt ?? now).toISOString(),
//     updatedAt: (req.updatedAt ?? req.createdAt ?? now).toISOString(),
//   };
//   return tenant;
//   // await this.db.insert(tenants).values(tenant).run();
//   // return Result.Ok({
//   //     tenantId: tenant.tenantId,
//   //     name: tenant.name,
//   //     ownerUserRefId: tenant.ownerUserRefId,
//   //     adminUserRefIds: JSON.parse(tenant.adminUserRefIds),
//   //     memberUserRefIds: JSON.parse(tenant.memberUserRefIds),
//   //     maxAdminUserRefs: tenant.maxAdminUserRefs,
//   //     maxMemberUserRefs: tenant.maxMemberUserRefs,
//   //     createdAt: new Date(tenant.createdAt),
//   //     updatedAt: new Date(tenant.updatedAt),
//   // });
// }

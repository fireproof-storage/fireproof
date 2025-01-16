// import 'dotenv/config';
// import { drizzle } from 'drizzle-orm/libsql';
// import { createClient } from '@libsql/client';
import { int, sqliteTable, text, primaryKey } from "drizzle-orm/sqlite-core";

export const userRefs = sqliteTable("UserRefs", {
  userRefId: text().primaryKey(),
  // userId from auth provider
  authUserId: text().notNull().unique(),
  // name of auth provider
  authProvider: text().notNull(),
  // json/jwt from auth provider
  params: text().notNull(),
  // max number of tenants
  maxTenants: int().notNull(),
  // iso date string
  createdAt: text().notNull(),
  // iso date string
  updatedAt: text().notNull(),
});

export const tenants = sqliteTable("Tenants", {
  tenantId: text().primaryKey(),
  name: text(),
  ownerUserRefId: text()
    .notNull()
    .references(() => userRefs.userRefId),
  adminUserRefIds: text().notNull(),
  memberUserRefIds: text().notNull(),
  maxAdminUserRefs: int().notNull(),
  maxMemberUserRefs: int().notNull(),
  createdAt: text().notNull(),
  updatedAt: text().notNull(),
});

export const tenantUserRefs = sqliteTable(
  "TenantUserRefs",
  {
    userRefId: text()
      .notNull()
      .references(() => userRefs.userRefId),
    tenantId: text()
      .notNull()
      .references(() => tenants.tenantId),
    name: text(),
    active: int().notNull(),
    default: int().notNull(),
    createdAt: text().notNull(),
    updatedAt: text().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userRefId, table.tenantId] }),
  }),
);

//   return {
//     pk: primaryKey({ columns: [table.tenantId, table.userRefId] }),
//   };
// })

// const client = createClient({ url: process.env.DB_FILE_NAME! });
// const db = drizzle({ client });

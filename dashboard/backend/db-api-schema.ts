// import 'dotenv/config';
// import { drizzle } from 'drizzle-orm/libsql';
// import { createClient } from '@libsql/client';
import { int, sqliteTable, text, primaryKey, index } from "drizzle-orm/sqlite-core";

export const userRefs = sqliteTable(
  "UserRefs",
  {
    userRefId: text().primaryKey(),
    // userId from auth provider
    authUserId: text().notNull().unique(),
    // name of auth provider
    authProvider: text().notNull(),
    // email key for QueryUser -> tolower - remove + and .
    queryEmail: text(),
    // nick key for QueryUser -> tolower
    queryNick: text(),
    // json/jwt from auth provider
    params: text().notNull(),
    // max number of tenants
    maxTenants: int().notNull().default(5),
    // max number of of open invites
    maxInvites: int().notNull().default(10),
    // iso date string
    createdAt: text().notNull(),
    // iso date string
    updatedAt: text().notNull(),
  },
  (table) => [index("queryEmailIdx").on(table.queryEmail), index("queryNickIdx").on(table.queryNick)],
);

export const tenants = sqliteTable("Tenants", {
  tenantId: text().primaryKey(),
  name: text(),
  ownerUserRefId: text()
    .notNull()
    .references(() => userRefs.userRefId),
  maxAdminUserRefs: int().notNull().default(5),
  maxMemberUserRefs: int().notNull().default(5),
  createdAt: text().notNull(),
  updatedAt: text().notNull(),
});

export const tenantUserRefRoles = sqliteTable(
  "TenantUserRefRoles",
  {
    tenantId: text()
      .notNull()
      .references(() => tenants.tenantId),
    userRefId: text()
      .notNull()
      .references(() => userRefs.userRefId),
    role: text().notNull(), // "admin" | "member"
    createdAt: text().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.userRefId] }),
    index("turrUserRefIdx").on(table.userRefId), // to enable delete by userRefId
  ],
);

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
  (table) => [primaryKey({ columns: [table.userRefId, table.tenantId] })],
);

export const ledgers = sqliteTable("Ledgers", {
  ledgerId: text().primaryKey(),
  tenantId: text()
    .notNull()
    .references(() => tenants.tenantId),
  name: text().notNull(),
  maxShares: int().notNull().default(5),
  createdAt: text().notNull(),
  updatedAt: text().notNull(),
});

export const ledgerUserRefRoles = sqliteTable(
  "LedgerUserRefs",
  {
    ledgerId: text().references(() => ledgers.ledgerId),
    userRefId: text().references(() => userRefs.userRefId),
    role: text().notNull(), // "admin" | "member"
    right: text().notNull(), // "read" | "write"
    createdAt: text().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ledgerId, table.userRefId, table.role] }),
    index("lurrUserRefIdx").on(table.userRefId), // to enable delete by userRefId
  ],
);

export const invites = sqliteTable(
  "Invites",
  {
    inviteId: text().primaryKey(),

    inviterUserRefId: text()
      .notNull()
      .references(() => userRefs.userRefId),
    // if set update/deletion is possible by other admins of that tenant
    inviterTenantId: text().references(() => tenants.tenantId),

    // email key for QueryUser -> tolower - remove + and .
    matchEmail: text(),
    // nick key for QueryUser -> tolower
    matchNick: text(),
    matchProvider: text(),

    sendEmailCount: int().notNull(),

    target: text().notNull(), // tenant | ledger
    // depending on target
    tenantId: text().references(() => tenants.tenantId),
    ledgerId: text().references(() => ledgers.ledgerId),

    // depending on target a JSON with e.g. the role and right
    params: text().notNull(),

    expiresAfter: text().notNull(),
    createdAt: text().notNull(),
  },
  (table) => [index("matchEmail").on(table.matchEmail), index("matchNick").on(table.matchNick)],
);

//   return {
//     pk: primaryKey({ columns: [table.tenantId, table.userRefId] }),
//   };
// })

// const client = createClient({ url: process.env.DB_FILE_NAME! });
// const db = drizzle({ client });

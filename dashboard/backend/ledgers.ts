import { int, sqliteTable, text, primaryKey, index } from "drizzle-orm/sqlite-core";
import { sqlTenants } from "./tenants.ts";
import { sqlUsers } from "./users.ts";

export const sqlLedgers = sqliteTable("Ledgers", {
  ledgerId: text().primaryKey(),
  tenantId: text()
    .notNull()
    .references(() => sqlTenants.tenantId),
  name: text().notNull(),
  maxShares: int().notNull().default(5),
  createdAt: text().notNull(),
  updatedAt: text().notNull(),
});

export const sqlLedgerUserRoles = sqliteTable(
  "LedgerUserRoles",
  {
    ledgerId: text().references(() => sqlLedgers.ledgerId),
    userRefId: text().references(() => sqlUsers.userId),
    role: text().notNull(), // "admin" | "member"
    right: text().notNull(), // "read" | "write"
    createdAt: text().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ledgerId, table.userRefId, table.role] }),
    index("lurrUserRefIdx").on(table.userRefId), // to enable delete by userRefId
  ],
);
